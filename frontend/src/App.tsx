import React, {useEffect, useState, useRef} from 'react';
import logo from './logo.svg';
import './App.css';
import Welcome from "./Welcome"
import WebSocketConnector from './WebSocketConnector';
import Conversation from './Conversation';
import Sidebar from './Sidebar';

const connector = new WebSocketConnector()

type Client = {
   connectionId: string,
   nickname: string
 }

function App() {
  const [nickname, setNickname] = useState(window.localStorage.getItem("nickname")|| "");

  useEffect(() => {
   window.localStorage.setItem("nickname", nickname)
  })

  const webSocket = useRef(connector)


  if (nickname===""){
    return <Welcome setNickname={setNickname}/>
  }


  const url = `wss://nammvwk9q1.execute-api.us-east-1.amazonaws.com/dev?nickname=${nickname}`

  const ws = webSocket.current.getConnection(url)

  ws.onopen = () => {
   ws.send(JSON.stringify({
      action: "getClients"
   }))
  }

  ws.onmessage = (e) => {
   const message = JSON.parse(e.data) as {
      type: string
      value: {
         clients: Client []
      }
   }
   console.log(message.value)
  }

  return (
   <div className="flex">
      <div className = "flex-none w-16 md:w-40 border-r-2">
         <Sidebar></Sidebar> 
      </div>
      <div className='flex-auto'>
         <Conversation></Conversation>
      </div>
      
      
   </div>
    
  );
}

export default App;
