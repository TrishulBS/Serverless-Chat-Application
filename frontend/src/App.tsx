import React, {useEffect, useState, useRef} from 'react';
import './App.css';
import Welcome from "./Welcome"
import WebSocketConnector from './WebSocketConnector';
import Conversation from './Conversation';
import Sidebar from './Sidebar';

const connector = new WebSocketConnector()

export type Client = {
   connectionId: string,
   nickname: string
 }

 export type Message = {
   messageId: string
   createdAt: number
   nicknameToNickname: string
   message: string
   sender: string
 }

function App() {
  const [nickname, setNickname] = useState(window.localStorage.getItem("nickname")|| "");

  const [clients, setClients] = useState<Client[]>([]);
  const [targetNicknameValue, setTargetNicknameValue] = useState(
   window.localStorage.getItem("lastTargetNickname")|| ""
  )
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
   window.localStorage.setItem("nickname", nickname)
   window.localStorage.setItem("lastTargetNickname", targetNicknameValue)

  })

  const webSocket = useRef(connector)


  if (nickname===""){
    return <Welcome 
    setNickname={(nickname) =>{
      setNickname(nickname)
      if(targetNicknameValue === ""){
         setTargetNicknameValue(nickname)
      }
    }}/>
  }


  const url = `wss://nammvwk9q1.execute-api.us-east-1.amazonaws.com/dev?nickname=${nickname}`

  const ws = webSocket.current.getConnection(url)

  ws.onopen = () => {
   ws.send(JSON.stringify({
      action: "getClients"
   }))

   loadMessages(targetNicknameValue)
  }

  const loadMessages = (nickname: string) => {
   ws.send(JSON.stringify({
      action: "getMessages",
      targetNickname: nickname,
      limit: 1000,
   }))
  }

  ws.onmessage = (e) => {
   console.log(e)
   const message = JSON.parse(e.data) as {
      type: string
      value: unknown
   }

   console.log(message)
   if (message.type === 'clients'){
      setClients((message.value as {clients: Client[]}).clients)
   }
   if (message.type === 'messages'){
      setMessages((message.value as {messages: Message[]}).messages.reverse())
   }

   if (message.type === 'message'){
      const messageValue = message.value as {message: Message}

      if (messageValue.message.sender === targetNicknameValue){
         setMessages([...messages, messageValue.message])
      }  
   } 
  }

  const setTargetNickname = (nickname: string) => {
   setMessages([])
   setTargetNicknameValue(nickname)
   loadMessages(nickname)
   setTargetNicknameValue(nickname)
  }

  const sendMessage = (message: string) => {
      ws.send(JSON.stringify({
         action: "sendMessage",
         message,
         recipientNickname: targetNicknameValue
      }))

      setMessages([
         ...messages,
         {
            message: message,
            sender: nickname,
            createdAt: new Date().getTime(),
            messageId: Math.random().toString(),
            nicknameToNickname: [nickname, targetNicknameValue].sort().join("#")
         }
        ])
  }

  

  return (
   <div className="flex">
      <div className="flex-none w-16 md:w-40 border-r-2">
         <Sidebar 
         nickname = {nickname}
         clients = {clients} setTargetNickname={setTargetNickname}></Sidebar>
      </div>
      <div className="flex-auto">
       <Conversation 
         nickname = {nickname}
         targetNickname={targetNicknameValue}
         messages={messages} 
         sendMessage={sendMessage}></Conversation>
      </div>
      
      
   </div>
    
  );
}

export default App;
