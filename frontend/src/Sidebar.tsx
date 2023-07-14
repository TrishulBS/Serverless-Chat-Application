import React from "react"
import {Client} from './App'

const Sidebar = ({
    nickname,
    clients,
    setTargetNickname
}: {
    nickname: string
    clients: Client[];
    setTargetNickname: (nickname: string) => void
}) => {
    return (
    <div className="flex flex-col md:ml-2">
        <div className="flex justify-center mt-8 mb-7 md: justify-start">
            <img src={`/public/doggos/${nickname}.jpeg`}
            alt="" 
            className="w-7  rounded-full mr-2 "/>
        <span className="invisible md:visible w-0 md:w-auto font-medium">Chats</span>
        </div>
        <div className="flex flex-col items-center md:items-start">
            {clients.map((client) => (
            <button onClick={() => setTargetNickname(client.nickname)}>
                <div className="flex mb-3">
                <img src={`doggos/${client.nickname}.jpeg`}
                alt="" 
                className="w-8 h-8 rounded-full mr-1.5"/>
            <span className="text-sm leading-8 invisible md:visible w-0 md:w-auto ">{client.nickname}</span>
            </div>
            </button>
            
            ))}
        </div>
    </div>
    )
}

export default Sidebar