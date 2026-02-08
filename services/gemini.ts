
import { GoogleGenAI, Type } from "@google/genai";

// Initialize using the mandatory named parameter as per SDK instructions
// The API key is sourced exclusively from the environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates smart replies based on chat context using Gemini.
 */
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
    
    // Accessing .text as a property directly, not a method
    const text = response.text || "[]";
    
    try {
      return JSON.parse(text) as string[];
    } catch (parseError) {
      console.error("Signal parsing error in Gemini response:", parseError, "Payload:", text);
      return ["Understood.", "Copy that.", "Acknowledged."];
    }
  } catch (error) {
    console.error("Gemini Intelligence Error:", error);
    return [];
  }
};

/**
 * Summarizes the conversation using Gemini.
 */
export const summarizeConversation = async (messages: string[]) => {
  try {
    const context = messages.join("\n");
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Perform an intelligence synthesis of the following transmission log. Summarize the core intent in 2 concise sentences:\n\n${context}`,
    });
    
    // Direct property access
    return response.text || "Transmission summary unavailable.";
  } catch (error) {
    console.error("Synthesis Error:", error);
    return "Failed to synthesize transmission log.";
  }
};
