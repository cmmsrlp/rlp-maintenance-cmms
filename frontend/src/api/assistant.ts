import { api } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendAssistantMessage(messages: ChatMessage[]): Promise<string> {
  const { data } = await api.post<{ reply: string }>("/assistant/chat", { messages });
  return data.reply;
}
