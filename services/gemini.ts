
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSmartReply = async (context: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Given the following chat history, suggest 3 short, helpful, and natural sounding replies for me to send next. Context:\n${context}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            description: "A short, helpful chat reply."
          }
        }
      }
    });
    
    // Accessing .text property directly
    const text = response.text || "[]";
    
    try {
      return JSON.parse(text) as string[];
    } catch (parseError) {
      console.error("Signal parsing error:", parseError);
      return ["Understood.", "Copy that.", "Acknowledged."];
    }
  } catch (error) {
    console.error("Gemini Intel Error:", error);
    return [];
  }
};

export const summarizeConversation = async (messages: string[]) => {
  try {
    const context = messages.join("\n");
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Synthesize the core intent of this log in 2 concise sentences:\n\n${context}`,
    });
    return response.text || "Summary unavailable.";
  } catch (error) {
    console.error("Synthesis Error:", error);
    return "Failed to synthesize transmission log.";
  }
};
