import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from "aws-lambda";
import AWS, { AWSError } from "aws-sdk"
import { Key } from "aws-sdk/clients/dynamodb";
import { v4 } from "uuid";

type Action = "$connect" | "$disconnect" | "getMessages" | "sendMessage" | "getClients"
type Client = {
  connectionId: string,
  nickname: string
}

type GetMessagesBody = {
  targetNickname: string
  limit: number
  startKey: Key | undefined
}

type SendMessageBody = {
  message: string
  recipientNickname: string
}

const CLIENT_TABLE_NAME = "Clients"
const MESSAGES_TABLE_NAME = "Messages"

class HandlerError extends Error{}

const responseOK = {
  statusCode: 200,
  body: ""
}

const responseForbidden = {
  statusCode: 403,
  body: ""
}

const docClient = new AWS.DynamoDB.DocumentClient()
const apiGw = new AWS.ApiGatewayManagementApi({
  endpoint: process.env["WSSAPIGATEWAYENDPOINT"]
})

export const handle = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId as string
  const routeKey = event.requestContext.routeKey as Action


  try{
  switch (routeKey) {
    case "$connect": 
      return handleConnect(connectionId, event.queryStringParameters)
    
    case "$disconnect":
      return handleDisconnect(connectionId)

    case "getClients":
      return handleGetClients(connectionId)

    case "sendMessage":
      return handleSendMessage(connectionId, parseSendMessageBody(event.body))

    case "getMessages":
      return handleGetMessages(connectionId, parseGetMessagesBody(event.body))
  
    default:
      return {
        statusCode: 500,
        body: ""
      }
  }
}
catch (e) {
  if (e instanceof HandlerError) {
    await postToConnection(connectionId, JSON.stringify({type: 'error', message: e.message}))
    return responseOK
  }
  throw e
}
};

const parseSendMessageBody = (body: string|null): SendMessageBody => {
  const sendMessageBody = JSON.parse(body || "{}") as SendMessageBody
  if (!sendMessageBody || typeof sendMessageBody.message!=="string"||typeof sendMessageBody.recipientNickname!=="string"){
    throw new HandlerError("incorrect sendMessageBody type format")
  }
  return sendMessageBody
}

const handleConnect = async (
  connectionId: string,
  queryParameters: APIGatewayProxyEventQueryStringParameters | null,
) => {
  if (!queryParameters || !queryParameters["nickname"]) {
    return responseForbidden;
  }

  const existingConnectionId = await getConnectionIdByNickname(
    queryParameters["nickname"],
  );
  if (
    existingConnectionId &&
    (await postToConnection(
      existingConnectionId,
      JSON.stringify({ type: "ping" }),
    ))
  ) {
    return responseForbidden;
  }

  await docClient
    .put({
      TableName: CLIENT_TABLE_NAME,
      Item: {
        connectionId,
        nickname: queryParameters["nickname"],
      },
    })
    .promise();

  await notifyClients(connectionId);

  return responseOK;
};

const getConnectionIdByNickname = async (nickname: string): Promise<string|undefined> => {
  const output = await docClient.query({
    TableName: CLIENT_TABLE_NAME,
    IndexName: "NicknameIndex",
    KeyConditionExpression: "#nickname=:nickname",
    ExpressionAttributeNames: {
      "#nickname": "nickname"
    },
    ExpressionAttributeValues: {
      ":nickname": nickname,
    }
  })
  .promise()

  if(output.Count && output.Count>0){
    const client = (output.Items as Client[])[0];
    return client.connectionId
  }
  return undefined

}


const parseGetMessagesBody = (body: string | null): GetMessagesBody => {
  const getMessagesBody = JSON.parse(body || "{}") as GetMessagesBody

  if (
    !getMessagesBody ||
    typeof getMessagesBody.targetNickname !== "string" ||
    typeof getMessagesBody.limit !== "number"
  ){
    throw new HandlerError("incorrect getmessages format")
  }
  return getMessagesBody
}


const handleDisconnect = async (connectionId: string): Promise<APIGatewayProxyResult> => {
 
  await docClient.delete({
    TableName: CLIENT_TABLE_NAME,
    Key: {
      connectionId
    }
  })
  .promise()

  await notifyClients(connectionId)

  return responseOK

}


const notifyClients = async(connectionIdToExclude: string) => {
  const clients = await getAllClients()
  await Promise.all(clients.filter((client) => client.connectionId !== connectionIdToExclude).map(async(client) => {
    await postToConnection(client.connectionId, createClientsMessage(clients))
  }))
}

const getAllClients = async(): Promise<Client[]> => {
  const output = await docClient
    .scan({
      TableName: CLIENT_TABLE_NAME
    })
    .promise()

  const clients =  output.Items || [] 
  return clients as Client[]
}


const postToConnection = async(connectionId: string, data: string): Promise<boolean> => {
  try{
    await apiGw
    .postToConnection({
      ConnectionId: connectionId,
      Data: data,
    })
    .promise()
    return true
  } catch(e) {
    if ((e as AWSError).statusCode !== 410) {
      throw e
    }
      await docClient.delete({
        TableName: CLIENT_TABLE_NAME,
        Key: {
          connectionId
        }
      })
      .promise()
      return false
    }
}


const handleGetClients = async(connectionId: string): Promise<APIGatewayProxyResult> => {

    const clients = await getAllClients()
    await postToConnection(connectionId, createClientsMessage(clients))
    
    return responseOK
}

const createClientsMessage = (clients: Client[]): string => {
  return JSON.stringify({type: "clients", value: {clients}})
}

const handleSendMessage = async(senderConnectionId: string, body: SendMessageBody): Promise<APIGatewayProxyResult> => {
  const senderClient = await getClient(senderConnectionId)

  const nicknameToNickname = getNicknameToNickname([senderClient.nickname, body.recipientNickname])

  await docClient.put({
    TableName: MESSAGES_TABLE_NAME,
    Item: {
      messageId: v4(),
      createdAt: new Date().getTime(),
      nicknameToNickname: nicknameToNickname,
      message: body.message,
      sender: senderClient.nickname
    }
  })
  .promise()

  const recipientConnectionId = await getConnectionIdByNickname(body.recipientNickname)
  if(recipientConnectionId){
    await postToConnection(recipientConnectionId, JSON.stringify({
      type:'message',
      value:  {
        sender: senderClient.nickname,
        message: body.message
      }
    }))
  }

  return responseOK
}

const getNicknameToNickname = (nicknames: string[]): string => nicknames.sort().join("#")

const getClient = async(connectionId: string) => {
  const output = await docClient.get({
    TableName: CLIENT_TABLE_NAME,
    Key: {
      connectionId,
    }
  })
  .promise()

  return output.Item as Client
}

const handleGetMessages = async (connectionId: string, body: GetMessagesBody): Promise<APIGatewayProxyResult> => {
  const client = await getClient(connectionId)
  const output = await docClient.query({
    TableName: MESSAGES_TABLE_NAME,
    IndexName: "NicknameToNicknameIndex",
    KeyConditionExpression: "#nicknameToNickname=:nicknameToNickname",
    ExpressionAttributeNames: {
      "#nicknameToNickname": "nicknameToNickname"
    },
    ExpressionAttributeValues: {
      ":nicknameToNickname": getNicknameToNickname([client.nickname, body.targetNickname]),
    },
    Limit: body.limit,
    ExclusiveStartKey: body.startKey,
    ScanIndexForward: false
  }).promise()
  const messages = output.Items && output.Items.length>0?output.Items: [];

  await postToConnection(connectionId, JSON.stringify({
    type: "messages",
    value: {
      messages
    }
  }))
  return responseOK
}