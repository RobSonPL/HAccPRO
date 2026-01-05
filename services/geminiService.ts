
import { GoogleGenAI, Type } from "@google/genai";
import { HACCPData } from "../types";

// Function to generate full HACCP content using Gemini
export const generateAIHACCPContent = async (data: HACCPData) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Jesteś ekspertem ds. systemów HACCP, GHP i GMP w Polsce. 
    Przygotuj profesjonalną dokumentację sanitarną dla firmy: ${data.details.name}.
    Typ dokumentu: ${data.docType}
    Branża: ${data.category}
    Wyposażenie techniczne: ${data.equipment.map(e => e.name).join(', ')}
    Dostawcy: ${data.suppliers.map(s => s.name + " (produkty: " + s.products + ")").join(', ')}
    Specyfika mycia GHP: ${data.ghpDetails.map(g => `${g.equipmentName}: ${g.frequency} przy użyciu ${g.cleaningAgent}`).join('; ')}
    Etapy procesu produkcyjnego: ${data.stages.map(s => s.name + " (" + s.description + ")").join(', ')}
    Produkty i ich kategorie: ${data.menuOrProducts.map(p => p.name + " [" + p.type + "]").join(', ')}
    Zidentyfikowane zagrożenia: ${data.productHazards.map(h => `${h.productName}: B[${h.biological}], C[${h.chemical}], F[${h.physical}]`).join('; ')}
    
    Wymagania techniczne odpowiedzi:
    Zwróć WYŁĄCZNIE poprawny JSON o określonej strukturze.
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
                  correctiveActions: { type: Type.STRING },
                  hazardType: { type: Type.STRING }
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
            sops: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING }
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

// Function to suggest allergens for a list of products
export const suggestAllergens = async (dishes: string[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const prompt = `Jesteś ekspertem ds. jakości. Dla listy potraw: ${dishes.join(', ')}, wskaż WSZYSTKIE możliwe alergeny z 14 głównych grup zgodnie z Rozp. 1169/2011.`;
  try {
    const response = await ai.models.generateContent({ 
      model, 
      contents: prompt, 
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dish: { type: Type.STRING },
                  allergens: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      } 
    });
    const parsed = JSON.parse(response.text);
    return parsed.suggestions || [];
  } catch (e) { return []; }
};

// Function to suggest typical dishes based on category
export const suggestDishes = async (category: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const prompt = `Zaproponuj listę 30 typowych potraw/produktów dla kategorii: ${category}. Przypisz im kategorię: mięsne, nabiałowe, wegetariańskie lub inne.`;
  try {
    const response = await ai.models.generateContent({ 
      model, 
      contents: prompt, 
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dishes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING }
                }
              }
            }
          }
        }
      } 
    });
    const parsed = JSON.parse(response.text);
    return parsed.dishes || [];
  } catch (e) { return []; }
};

// Function to suggest SOPs based on category
export const suggestSOPsByCategory = async (category: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const prompt = `Wygeneruj listę 6 kluczowych procedur SOP (np. Mycie rąk, Przyjęcie dostawy) dla branży ${category}.`;
  try {
    const response = await ai.models.generateContent({ 
      model, 
      contents: prompt, 
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sops: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING }
                }
              }
            }
          }
        }
      } 
    });
    const parsed = JSON.parse(response.text);
    return parsed.sops || [];
  } catch (e) { return []; }
};

// Fixed: Added missing suggestProductHazards implementation
export const suggestProductHazards = async (productNames: string[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const prompt = `Jesteś ekspertem ds. jakości żywności. Dla poniższych produktów: ${productNames.join(', ')}, zaproponuj potencjalne zagrożenia biologiczne, chemiczne i fizyczne.`;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hazards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  productName: { type: Type.STRING },
                  biological: { type: Type.STRING },
                  chemical: { type: Type.STRING },
                  physical: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });
    const parsed = JSON.parse(response.text);
    return parsed.hazards || [];
  } catch (e) {
    console.error("AI Error:", e);
    return [];
  }
};

// Fixed: Added missing suggestStages implementation
export const suggestStages = async (category: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const prompt = `Zaproponuj standardowe etapy procesu produkcyjnego dla branży: ${category}.`;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });
    const parsed = JSON.parse(response.text);
    return parsed.stages || [];
  } catch (e) {
    console.error("AI Error:", e);
    return [];
  }
};
