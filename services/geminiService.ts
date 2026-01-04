
import { GoogleGenAI, Type } from "@google/genai";
import { HACCPData } from "../types";

export const generateAIHACCPContent = async (data: HACCPData) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Jesteś starszym ekspertem ds. HACCP i Sanepidu w Polsce. Wygeneruj profesjonalną dokumentację typu: ${data.docType}.
    Nazwa firmy: ${data.details.name}
    Branża: ${data.category}
    Wyposażenie: ${data.equipment.map(e => e.name).join(', ')}
    Etapy procesu: ${data.stages.map(s => s.name).join(', ')}
    Produkty/Potrawy: ${data.menuOrProducts.join(', ')}
    Warunki pracy: Temp. ${data.workingConditions.temperature}, Wilgotność ${data.workingConditions.humidity}, Przewiew ${data.workingConditions.ventilation}.
    Alergeny: ${data.allergenMatrix.map(a => a.productName + ": " + a.allergens.join(", ")).join('; ')}
    
    Zwróć odpowiedź w formacie JSON z kluczami:
    1. "summary": Profesjonalny wstęp prawniczy.
    2. "ghpInstructions": Lista obiektów (device, action, agent, frequency) dla urządzeń.
    3. "ccps": Lista obiektów (title, hazard, monitoring, criticalLimits, correctiveActions). Uwzględnij typowe CCP dla branży (np. Przyjęcie towaru, Obróbka termiczna).
    4. "allergenTable": Lista obiektów (dish, allergensDescription) z opisem (np. "Jaja (w panierce)").
    5. "hazardAnalysis": Lista obiektów (categoryName, dishName, biological, chemical, physical [tablice stringów]).
    6. "flowDiagram": ASCII diagram przepływu.

    Jeśli wybrano tylko GHP, skup się na instrukcjach sanitarnych. Jeśli HACCP, na analizie zagrożeń i CCP.
    Dostosuj analizę zagrożeń do podanych warunków pracy (wilgotność, temperatura).
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            ghpInstructions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  device: { type: Type.STRING },
                  action: { type: Type.STRING },
                  agent: { type: Type.STRING },
                  frequency: { type: Type.STRING }
                }
              }
            },
            ccps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  hazard: { type: Type.STRING },
                  monitoring: { type: Type.STRING },
                  criticalLimits: { type: Type.STRING },
                  correctiveActions: { type: Type.STRING }
                }
              }
            },
            allergenTable: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dish: { type: Type.STRING },
                  allergensDescription: { type: Type.STRING }
                }
              }
            },
            hazardAnalysis: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  categoryName: { type: Type.STRING },
                  dishName: { type: Type.STRING },
                  biological: { type: Type.ARRAY, items: { type: Type.STRING } },
                  chemical: { type: Type.ARRAY, items: { type: Type.STRING } },
                  physical: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            },
            flowDiagram: { type: Type.STRING }
          }
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
};

export const suggestAllergens = async (dishes: string[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  
  const prompt = `Dla listy potraw: ${dishes.join(', ')}, wskaż prawdopodobne alergeny z listy: Zboża (Gluten), Skorupiaki, Jaja, Ryby, Orzeszki ziemne, Soja, Mleko (Laktoza), Orzechy, Seler, Gorczyca, Sezam, Dwutlenek siarki, Łubin, Mięczaki. 
  Zwróć JSON: { "suggestions": [ { "dish": "nazwa", "allergens": ["alergen1", "alergen2"] } ] }`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text).suggestions;
  } catch (e) {
    return [];
  }
};

export const suggestDishes = async (category: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  
  const prompt = `Jako ekspert gastronomiczny, zaproponuj 10 najczęstszych potraw lub grup produktów dla kategorii: ${category}. Skup się na rzeczach wymagających rygorystycznego HACCP (mięsa, nabiał, surowe składniki).
  Zwróć JSON: { "dishes": ["Danie 1", "Danie 2", ...] }`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text).dishes;
  } catch (e) {
    console.error("Dish suggestion error:", e);
    return [];
  }
};
