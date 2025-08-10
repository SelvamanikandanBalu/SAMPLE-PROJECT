import { io } from "socket.io-client";

const socket = io("https://sample-project-ndlm.onrender.com", {
  transports: ["websocket", "polling"],
});

export default socket;
