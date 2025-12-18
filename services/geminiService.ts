import { GoogleGenAI } from "@google/genai";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.warn("API Key not found in environment variables");
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

export const getTacticalAdvice = async (
    level: number,
    gridSize: number,
    minesRemaining: number
): Promise<string> => {
    const ai = getClient();
    if (!ai) return "Tactical Uplink Offline. Proceed with caution.";

    try {
        const prompt = `
        You are a futuristic military commander advising a drone operator.
        The operator is clearing a minefield (Minesweeper style) using projectile probes (Angry Birds style).
        
        Current Status:
        - Mission Level: ${level}
        - Grid Size: ${gridSize}x${gridSize}
        - Estimated Threat Count (Mines): ${minesRemaining}
        
        Give a short, one-sentence tactical advice or encouraging remark suitable for a sci-fi HUD. 
        Sound professional but urgent.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text || "Systems nominal. Engage targets.";
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Communication interference detected. Trust your instincts.";
    }
};
