import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayProxyResult } from "aws-lambda";
import AWS, { AWSError } from "aws-sdk"
import { StringReference } from "aws-sdk/clients/connect";

type Action = "$connect" | "$disconnect" | "getMessages" | "sendMessage" | "getClients"
type Client = {
  connectionId: string,
  nickname: string
}

type SendMessageBody = {
  message: string
  recipientNickname: string
}

const CLIENT_TABLE_NAME = "Clients"

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
      const body = parseSendMessageBody(event.body)
      return handleSendMessage(connectionId, body)
  
    default:
      return {
        statusCode: 500,
        body: ""
      }
  }
}
catch (e) {
  if (e instanceof HandlerError) {
    await postToConnection(connectionId, e.message)
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

const handleConnect = async (connectionId: string, queryParams: APIGatewayProxyEventQueryStringParameters | null): Promise<APIGatewayProxyResult> => {
  if(!queryParams || !queryParams["nickname"]) {
    return responseForbidden
  }

  const output = await docClient.query({
    TableName: CLIENT_TABLE_NAME,
    IndexName: "NicknameIndex",
    KeyConditionExpression: "#nickname=:nickname",
    ExpressionAttributeNames: {
      "#nickname": "nickname"
    },
    ExpressionAttributeValues: {
      ":nickname": queryParams["nickname"],
    }
  })
  .promise()

  if(output.Count && output.Count>0){
    const client = (output.Items as Client[])[0];
    if (await postToConnection(client.connectionId, JSON.stringify({type: "ping"}))){
      return responseForbidden
    }
  }

  await docClient.put({
    TableName: CLIENT_TABLE_NAME,
    Item: {
      connectionId,
      nickname: queryParams["nickname"]
    }
  })
  .promise()

  await notifyClients(connectionId)

  return responseOK

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

const handleSendMessage = async(senderConnectionId: string, body)