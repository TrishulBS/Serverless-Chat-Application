import React, {useState} from "react"

const Welcome = ({setNickname}: {
    setNickname: (nickname: string) => void 
}) => {
    const [nicknameValue, setNicknameValue] = useState("")
    const [errorMessage, setErrorMessage] = useState("")
    return (
        <section className="flex justify-center items-center h-screen bg-gray-100">
    <div className="max-w-md w-full bg-white rounded p-6 space-y-4">
        <div className="mb-4">
            <h2 className="text-xl font-bold">WebChat</h2>
        </div>
        <div>
            <input 
                className="w-full p-4 text-sm bg-gray-50 focus:outline-none border border-gray-200 rounded text-gray-600" 
                type="text" 
                placeholder="Nickname"
                onChange={(e) => setNicknameValue(e.target.value)}
                value = {nicknameValue}
            />
            {errorMessage!==""?(<span className="text-red-500 font-medium text-xs">{errorMessage}</span>): ("")}
        </div>
        <div>
            <button 
                onClick = {() => nicknameValue === ""? setErrorMessage("Nickname cannot be empty"): setNickname(nicknameValue)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded text-sm font-bold text-gray-50 transition duration-200">Join</button>
        </div>
    </div>
</section>
    )
}

export default Welcome