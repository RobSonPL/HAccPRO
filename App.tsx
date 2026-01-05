
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { HACCPCategory, HACCPData, Equipment, ProductionStage, Vehicle, Hazard, Supplier, AllergenEntry, DocType, ProductHazard } from './types';
import { StepWizard } from './components/StepWizard';
import { generateAIHACCPContent, suggestAllergens, suggestDishes, suggestProductHazards, suggestStages } from './services/geminiService';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } from "docx";
import * as FileSaver from "file-saver";

const INITIAL_DATA: HACCPData = {
  category: HACCPCategory.GASTRONOMY,
  docType: 'HACCP',
  details: { name: '', address: '', nip: '', representative: '' },
  menuOrProducts: [],
  equipment: [],
  stages: [],
  suppliers: [],
  allergenMatrix: [],
  productHazards: [],
  fleet: [],
  workingConditions: {
    temperature: '',
    humidity: '',
    ventilation: ''
  },
  specifics: { allergens: [] },
  hazards: [],
  sopBlocks: []
};

const CATEGORIES_CONFIG = [
  { id: HACCPCategory.GASTRONOMY, label: 'Gastronomia', icon: 'fa-utensils', color: 'bg-orange-500' },
  { id: HACCPCategory.PRODUCTION, label: 'Produkcja Spożywcza', icon: 'fa-industry', color: 'bg-indigo-500' },
  { id: HACCPCategory.LOGISTICS, label: 'Logistyka i Transport', icon: 'fa-truck-ramp-box', color: 'bg-emerald-500' },
  { id: HACCPCategory.FOODTRUCK, label: 'Mobile Gastronomy (Food Truck)', icon: 'fa-truck', color: 'bg-pink-500' },
];

const DOC_TYPES: DocType[] = ['HACCP', 'GHP', 'GMP', 'HACCP + GHP'];

const ALLERGENS_LIST = ['Zboża (Gluten)', 'Skorupiaki', 'Jaja', 'Ryby', 'Orzeszki ziemne', 'Soja', 'Mleko (Laktoza)', 'Orzechy', 'Seler', 'Gorczyca', 'Sezam', 'Dwutlenek siarki', 'Łubin', 'Mięczaki'];

const COMMON_EQUIPMENT = [
  'Zmywarka', 'Piec konwekcyjny', 'Chłodnia', 'Krajalnica', 'Pakowarka próżniowa', 
  'Wyparzarka', 'Frytownica', 'Kuchnia gazowa', 'Zlew dwukomorowy'
];

export default function App() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<HACCPData>(INITIAL_DATA);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingAllergens, setIsSuggestingAllergens] = useState(false);
  const [isSuggestingDishes, setIsSuggestingDishes] = useState(false);
  const [isSuggestingHazards, setIsSuggestingHazards] = useState(false);
  const [isSuggestingStages, setIsSuggestingStages] = useState(false);
  const [suggestedDishesList, setSuggestedDishesList] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDoc, setIsExportingDoc] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [nipError, setNipError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ensureApiKey = async () => {
      if (typeof window.aistudio !== 'undefined') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) await window.aistudio.openSelectKey();
      }
    };
    ensureApiKey();
  }, []);

  const validateNip = (value: string) => {
    const nipRegex = /^\d{10}$/;
    if (!value) { setNipError(null); return false; }
    if (!nipRegex.test(value)) { setNipError('NIP musi mieć 10 cyfr.'); return false; }
    setNipError(null);
    return true;
  };

  const updateDetails = (field: keyof HACCPData['details'], value: string) => {
    if (field === 'nip') validateNip(value);
    setData(prev => ({ ...prev, details: { ...prev.details, [field]: value } }));
  };

  const toggleMenuItem = (item: string) => {
    setData(prev => ({
      ...prev,
      menuOrProducts: prev.menuOrProducts.includes(item) 
        ? prev.menuOrProducts.filter(i => i !== item) 
        : [...prev.menuOrProducts, item]
    }));
  };

  const handleSuggestDishes = async () => {
    setIsSuggestingDishes(true);
    const dishes = await suggestDishes(data.category);
    setSuggestedDishesList(dishes);
    setIsSuggestingDishes(false);
  };

  const handleSuggestHazards = async () => {
    if (data.menuOrProducts.length === 0) return;
    setIsSuggestingHazards(true);
    const hazards = await suggestProductHazards(data.menuOrProducts);
    setData(prev => ({ ...prev, productHazards: hazards }));
    setIsSuggestingHazards(false);
  };

  const handleSuggestStages = async () => {
    setIsSuggestingStages(true);
    const stages = await suggestStages(data.category);
    setData(prev => ({ 
      ...prev, 
      stages: stages.map((s: any) => ({ ...s, id: Math.random().toString() }))
    }));
    setIsSuggestingStages(false);
  };

  const toggleCommonEquipment = (name: string) => {
    setData(prev => {
      const exists = prev.equipment.find(e => e.name === name);
      if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.name !== name) };
      return { ...prev, equipment: [...prev.equipment, { id: Math.random().toString(36).substr(2, 9), name, count: 1 }] };
    });
  };

  const handleSuggestAllergens = async () => {
    if (data.menuOrProducts.length === 0) return;
    setIsSuggestingAllergens(true);
    const suggestions = await suggestAllergens(data.menuOrProducts);
    setData(prev => ({
      ...prev,
      allergenMatrix: prev.allergenMatrix.map(entry => {
        const suggestion = suggestions.find((s: any) => s.dish === entry.productName);
        return suggestion ? { ...entry, allergens: suggestion.allergens } : entry;
      })
    }));
    setIsSuggestingAllergens(false);
  };

  useEffect(() => {
    const products = data.menuOrProducts;
    setData(prev => {
      const filteredAllergens = prev.allergenMatrix.filter(a => products.includes(a.productName));
      const missingAllergens = products.filter(p => !filteredAllergens.find(a => a.productName === p));
      const newAllergenEntries = missingAllergens.map(p => ({ productName: p, allergens: [] }));
      
      const filteredHazards = prev.productHazards.filter(h => products.includes(h.productName));
      const missingHazards = products.filter(p => !filteredHazards.find(h => h.productName === p));
      const newHazardEntries = missingHazards.map(p => ({ productName: p, biological: '', chemical: '', physical: '' }));

      return { 
        ...prev, 
        allergenMatrix: [...filteredAllergens, ...newAllergenEntries],
        productHazards: [...filteredHazards, ...newHazardEntries]
      };
    });
  }, [data.menuOrProducts]);

  const handleNext = async () => {
    if (step === 2 && !/^\d{10}$/.test(data.details.nip)) return;
    if (step === 7) {
      setIsGenerating(true);
      try {
        const res = await generateAIHACCPContent(data);
        if (res && typeof res === 'object') {
          setGeneratedResult(res);
          setStep(8);
        } else {
          throw new Error("Pusta odpowiedź z modelu AI.");
        }
      } catch (err: any) { 
        console.error("Błąd podczas generowania:", err);
        alert(`Wystąpił błąd podczas generowania dokumentacji. Spróbuj ponownie.`); 
      } finally { 
        setIsGenerating(false); 
      }
    } else {
      setStep(prev => prev + 1);
    }
  };

  const handleSkipAndGenerate = () => {
    setIsGenerating(true);
    const tempConditions = {
      temperature: data.workingConditions.temperature || 'Nie określono (standardowa pokojowa)',
      humidity: data.workingConditions.humidity || 'Nie określono (standardowa)',
      ventilation: data.workingConditions.ventilation || 'Nie określono (grawitacyjna)'
    };
    generateAIHACCPContent({ ...data, workingConditions: tempConditions })
      .then(res => {
        if (res) { setGeneratedResult(res); setStep(8); }
      })
      .catch(err => alert("Błąd generowania."))
      .finally(() => setIsGenerating(false));
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    window.scrollTo(0, 0);
    try {
      const html2canvas = (window as any).html2canvas;
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = (window as any).jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      let hLeft = pdfHeight;
      let pos = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, pos, pdfWidth, pdfHeight);
      hLeft -= pageHeight;
      while (hLeft >= 0) {
        pos = hLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, pos, pdfWidth, pdfHeight);
        hLeft -= pageHeight;
      }
      pdf.save(`HACCP_${data.details.name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) { alert("Błąd PDF."); } finally { setIsExporting(false); }
  };

  const exportToDOCX = async () => {
    if (!generatedResult) return;
    setIsExportingDoc(true);
    try {
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ text: `System ${data.docType}`, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: data.details.name, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: data.details.address, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: "1. Warunki pracy", heading: HeadingLevel.HEADING_3 }),
            new Paragraph({ text: `Temperatura: ${data.workingConditions.temperature}` }),
            new Paragraph({ text: `Wilgotność: ${data.workingConditions.humidity}` }),
            new Paragraph({ text: `Wentylacja: ${data.workingConditions.ventilation}` }),
            new Paragraph({ text: "2. Instrukcje GHP", heading: HeadingLevel.HEADING_3 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: ["Urządzenie", "Czynność", "Środek", "Częstotliwość"].map(t => new TableCell({ children: [new Paragraph({ text: t, bold: true })] })) }),
                ...generatedResult.ghpInstructions.map((ghp: any) => new TableRow({ children: [ghp.device, ghp.action, ghp.agent, ghp.frequency].map(t => new TableCell({ children: [new Paragraph({ text: t })] })) }))
              ]
            }),
          ]
        }]
      });
      const blob = await Packer.toBlob(doc);
      FileSaver.saveAs(blob, `Dokumentacja_${data.details.name.replace(/\s+/g, '_')}.docx`);
    } catch (e) { alert("Błąd DOCX."); } finally { setIsExportingDoc(false); }
  };

  const hazardStats = useMemo(() => {
    const stats = { bio: 0, chem: 0, phys: 0 };
    data.productHazards.forEach(h => {
      if (h.biological.trim()) stats.bio++;
      if (h.chemical.trim()) stats.chem++;
      if (h.physical.trim()) stats.phys++;
    });
    const total = stats.bio + stats.chem + stats.phys || 1;
    return {
      bioPerc: Math.round((stats.bio / total) * 100),
      chemPerc: Math.round((stats.chem / total) * 100),
      physPerc: Math.round((stats.phys / total) * 100),
      counts: stats
    };
  }, [data.productHazards]);

  const currentStepConfig = useMemo(() => [
    { component: () => (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-800">Typ dokumentu i branża</h2>
        <div className="bg-slate-50 p-6 rounded-xl border mb-6 shadow-inner">
          <h3 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest">Rodzaj dokumentacji:</h3>
          <div className="flex flex-wrap gap-4">
            {DOC_TYPES.map(type => (
              <label key={type} className={`flex-1 min-w-[120px] p-3 rounded-xl border-2 cursor-pointer transition-all text-center ${data.docType === type ? 'border-blue-500 bg-blue-50 font-bold text-blue-800 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
                <input type="radio" className="hidden" name="docType" checked={data.docType === type} onChange={() => setData(prev => ({ ...prev, docType: type }))} />
                {type}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CATEGORIES_CONFIG.map(cat => (
            <button key={cat.id} onClick={() => setData(prev => ({ ...prev, category: cat.id }))}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${data.category === cat.id ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-100' : 'border-slate-100 bg-white hover:border-blue-200'}`}>
              <div className={`w-12 h-12 ${cat.color} rounded-xl flex items-center justify-center text-white mb-4 shadow-sm`}><i className={`fa-solid ${cat.icon} text-xl`}></i></div>
              <h3 className="font-black text-lg text-slate-800">{cat.label}</h3>
            </button>
          ))}
        </div>
      </div>
    ), canNext: !!data.category && !!data.docType },
    { component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Dane i Sprzęt</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <input placeholder="Nazwa Firmy" className="p-3 border rounded-xl" value={data.details.name} onChange={e => updateDetails('name', e.target.value)} />
          <input placeholder="NIP" className={`p-3 border rounded-xl ${nipError ? 'border-red-300' : ''}`} value={data.details.nip} onChange={e => updateDetails('nip', e.target.value)} maxLength={10} />
          <input placeholder="Adres" className="p-3 border rounded-xl md:col-span-2" value={data.details.address} onChange={e => updateDetails('address', e.target.value)} />
          <input placeholder="Przedstawiciel" className="p-3 border rounded-xl md:col-span-2" value={data.details.representative} onChange={e => updateDetails('representative', e.target.value)} />
        </div>
        <div className="bg-slate-50 p-6 rounded-2xl border shadow-inner">
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Posiadany sprzęt:</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {COMMON_EQUIPMENT.map(name => {
              const isSel = data.equipment.some(e => e.name === name);
              return (
                <button key={name} onClick={() => toggleCommonEquipment(name)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${isSel ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-white text-slate-600 hover:border-emerald-400'}`}>{name}</button>
              );
            })}
          </div>
          <div className="space-y-2">
            {data.equipment.map(eq => (
              <div key={eq.id} className="flex gap-2 animate-fade-in items-center bg-white p-2 rounded-lg border">
                <span className="flex-1 font-bold text-sm">{eq.name}</span>
                <button onClick={() => setData(prev => ({ ...prev, equipment: prev.equipment.filter(i => i.id !== eq.id) }))} className="text-red-400 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    ), canNext: !!data.details.name && /^\d{10}$/.test(data.details.nip) && data.equipment.length > 0 },
    { component: () => (
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <h2 className="text-2xl font-bold text-slate-800">Menu i Produkty</h2>
          <button onClick={handleSuggestDishes} disabled={isSuggestingDishes} className="text-xs bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-black border border-indigo-100 flex items-center">
            {isSuggestingDishes ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>} SUGERUJ AI
          </button>
        </div>
        {suggestedDishesList.length > 0 && (
          <div className="bg-slate-50 p-5 rounded-2xl border shadow-inner flex flex-wrap gap-2">
            {suggestedDishesList.map(dish => (
              <button key={dish} onClick={() => toggleMenuItem(dish)} className={`px-4 py-2 rounded-xl text-xs font-bold border ${data.menuOrProducts.includes(dish) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{dish}</button>
            ))}
          </div>
        )}
        <input placeholder="Wpisz i naciśnij Enter..." className="w-full p-4 border rounded-2xl shadow-sm" onKeyDown={e => {
          if (e.key === 'Enter') {
            const val = (e.target as HTMLInputElement).value.trim();
            if (val) { toggleMenuItem(val); (e.target as HTMLInputElement).value = ''; }
          }
        }} />
        <div className="flex flex-wrap gap-3">
          {data.menuOrProducts.map(dish => (
            <span key={dish} className="bg-blue-100 text-blue-900 px-4 py-2 rounded-xl text-xs font-black flex items-center">{dish} <button onClick={() => toggleMenuItem(dish)} className="ml-3 text-red-400">×</button></span>
          ))}
        </div>
      </div>
    ), canNext: data.menuOrProducts.length > 0 },
    { component: () => (
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Etapy Produkcji</h2>
            <p className="text-sm text-slate-500">Zdefiniuj co najmniej 3 główne etapy procesu produkcji żywności.</p>
          </div>
          <button onClick={handleSuggestStages} disabled={isSuggestingStages} className="text-xs bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-black border border-indigo-100 flex items-center shadow-sm">
             {isSuggestingStages ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-robot mr-2"></i>} SUGERUJ ETAPY AI
          </button>
        </div>
        <div className="space-y-4">
          {data.stages.map((stage, idx) => (
            <div key={stage.id} className="p-4 border-2 border-slate-100 rounded-2xl bg-white shadow-sm space-y-3 relative group">
              <button onClick={() => setData(prev => ({ ...prev, stages: prev.stages.filter(s => s.id !== stage.id) }))} className="absolute top-2 right-2 text-red-400 hover:text-red-600">Usuń</button>
              <input 
                placeholder={`Etap ${idx+1} (np. Przygotowanie surowców)`} 
                className="w-full p-2 font-bold border-b outline-none" 
                value={stage.name} 
                onChange={e => {
                  const val = e.target.value;
                  setData(prev => ({ ...prev, stages: prev.stages.map(s => s.id === stage.id ? { ...s, name: val } : s) }));
                }}
              />
              <textarea 
                placeholder="Krótki opis czynności w tym etapie..." 
                className="w-full p-2 text-sm text-slate-600 h-16 border rounded outline-none" 
                value={stage.description}
                onChange={e => {
                  const val = e.target.value;
                  setData(prev => ({ ...prev, stages: prev.stages.map(s => s.id === stage.id ? { ...s, description: val } : s) }));
                }}
              />
            </div>
          ))}
          <button 
            onClick={() => setData(prev => ({ ...prev, stages: [...prev.stages, { id: Math.random().toString(), name: '', description: '' }] }))}
            className="w-full py-4 border-2 border-dashed border-blue-200 rounded-2xl text-blue-500 font-bold hover:bg-blue-50 transition-all"
          >+ Dodaj kolejny etap</button>
        </div>
      </div>
    ), canNext: data.stages.length >= 3 && data.stages.every(s => s.name.trim() !== '' && s.description.trim() !== '') },
    { component: () => (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">Analiza Zagrożeń</h2>
          <button onClick={handleSuggestHazards} disabled={isSuggestingHazards} className="text-xs bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-black border border-indigo-100 flex items-center shadow-sm">
             {isSuggestingHazards ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-robot mr-2"></i>} SUGESTIE AI
          </button>
        </div>
        <div className="space-y-6">
          {data.productHazards.map((h, idx) => (
            <div key={h.productName} className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white p-3 font-bold uppercase text-xs">{h.productName}</div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 block">Biologiczne</label>
                  <textarea 
                    className="w-full p-2 text-xs border rounded h-20" 
                    value={h.biological} 
                    onChange={e => setData(prev => ({ ...prev, productHazards: prev.productHazards.map(ph => ph.productName === h.productName ? { ...ph, biological: e.target.value } : ph) }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 block">Chemiczne</label>
                  <textarea 
                    className="w-full p-2 text-xs border rounded h-20" 
                    value={h.chemical} 
                    onChange={e => setData(prev => ({ ...prev, productHazards: prev.productHazards.map(ph => ph.productName === h.productName ? { ...ph, chemical: e.target.value } : ph) }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1 block">Fizyczne</label>
                  <textarea 
                    className="w-full p-2 text-xs border rounded h-20" 
                    value={h.physical} 
                    onChange={e => setData(prev => ({ ...prev, productHazards: prev.productHazards.map(ph => ph.productName === h.productName ? { ...ph, physical: e.target.value } : ph) }))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ), canNext: data.productHazards.every(h => h.biological !== '' || h.chemical !== '' || h.physical !== '') },
    { component: () => (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">Alergeny</h2>
          <button onClick={handleSuggestAllergens} disabled={isSuggestingAllergens} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center shadow-xl">
            {isSuggestingAllergens ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>} ANALIZUJ AI
          </button>
        </div>
        <div className="overflow-x-auto border rounded-2xl shadow-xl bg-white">
          <table className="w-full text-[10px] text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4 border-b sticky left-0 bg-slate-50 z-10 font-black uppercase text-slate-400">Produkt</th>
                {ALLERGENS_LIST.map(a => <th key={a} className="p-1 rotate-90 h-36 border-l border-b text-slate-500 font-bold whitespace-nowrap">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.allergenMatrix.map(entry => (
                <tr key={entry.productName} className="border-b hover:bg-blue-50/30">
                  <td className="p-4 font-black border-r sticky left-0 bg-white">{entry.productName}</td>
                  {ALLERGENS_LIST.map(a => (
                    <td key={a} className="p-2 text-center border-l">
                      <input type="checkbox" className="w-5 h-5 text-blue-600 cursor-pointer" checked={entry.allergens.includes(a)} onChange={() => {
                        setData(prev => ({
                          ...prev, allergenMatrix: prev.allergenMatrix.map(am => am.productName === entry.productName 
                            ? { ...am, allergens: am.allergens.includes(a) ? am.allergens.filter(x => x !== a) : [...am.allergens, a] } : am)
                        }));
                      }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ), canNext: true },
    { component: () => (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">Warunki pracy</h2>
          <button onClick={handleSkipAndGenerate} className="text-xs text-blue-600 font-black uppercase tracking-widest hover:underline">Pomiń i generuj raport</button>
        </div>
        <div className="bg-white p-8 rounded-2xl border-2 border-slate-100 space-y-6 shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Temperatura otoczenia</label>
            <input placeholder="np. +18°C do +22°C" className="w-full p-4 border rounded-xl" value={data.workingConditions.temperature} onChange={e => setData(prev => ({ ...prev, workingConditions: { ...prev.workingConditions, temperature: e.target.value } }))} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Wilgotność powietrza</label>
            <input placeholder="np. 45% - 60%" className="w-full p-4 border rounded-xl" value={data.workingConditions.humidity} onChange={e => setData(prev => ({ ...prev, workingConditions: { ...prev.workingConditions, humidity: e.target.value } }))} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">System wentylacji</label>
            <input placeholder="np. Mechaniczna, sprawna" className="w-full p-4 border rounded-xl" value={data.workingConditions.ventilation} onChange={e => setData(prev => ({ ...prev, workingConditions: { ...prev.workingConditions, ventilation: e.target.value } }))} />
          </div>
        </div>
      </div>
    ), canNext: !!data.workingConditions.temperature && !!data.workingConditions.humidity && !!data.workingConditions.ventilation }
  ], [data, nipError, isSuggestingDishes, suggestedDishesList, isSuggestingAllergens, isSuggestingHazards, isSuggestingStages]);

  const renderFinalResult = () => {
    if (!generatedResult) return (
      <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
        <div className="relative w-24 h-24 mb-6"><div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div><i className="fa-solid fa-robot absolute inset-0 flex items-center justify-center text-3xl text-blue-600"></i></div>
        <h2 className="text-xl font-black text-slate-800 mb-2">Trwa analiza danych przez AI...</h2>
      </div>
    );
    
    return (
      <div className="max-w-5xl mx-auto animate-fade-in pb-20">
        <div className="bg-slate-900 text-white p-8 rounded-3xl mb-10 flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl no-print border-b-8 border-blue-600">
          <div><h1 className="text-3xl font-black tracking-tighter">Dokumentacja Wygenerowana</h1></div>
          <div className="flex gap-4">
            <button onClick={exportToPDF} disabled={isExporting} className="bg-rose-600 px-8 py-3.5 rounded-2xl font-black flex items-center shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
              {isExporting ? <i className="fa-solid fa-spinner fa-spin mr-3"></i> : <i className="fa-solid fa-file-pdf mr-3"></i>} EKSPORT PDF
            </button>
            <button onClick={exportToDOCX} disabled={isExportingDoc} className="bg-blue-600 px-8 py-3.5 rounded-2xl font-black flex items-center shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
              {isExportingDoc ? <i className="fa-solid fa-spinner fa-spin mr-3"></i> : <i className="fa-solid fa-file-word mr-3"></i>} EKSPORT WORD
            </button>
          </div>
        </div>

        <div ref={reportRef} className="bg-white p-12 border shadow-2xl print:shadow-none print:border-none space-y-20 text-slate-900 leading-relaxed font-inter overflow-visible">
           <section className="text-center py-32 border-[16px] border-double border-slate-100 p-10 page-break rounded-[40px]">
              <h2 className="text-5xl font-black mb-4 uppercase tracking-tighter text-slate-900">System Bezpieczeństwa Żywności</h2>
              <h3 className="text-2xl font-black text-blue-600 uppercase mb-12 tracking-widest">{data.docType}</h3>
              <div className="max-w-2xl mx-auto bg-slate-50 p-12 rounded-[32px] border-2 border-slate-100 text-left space-y-6">
                <p className="flex justify-between border-b pb-3"><span className="text-slate-400 text-[10px] font-black uppercase">Podmiot:</span> <span className="font-black uppercase">{data.details.name}</span></p>
                <p className="flex justify-between border-b pb-3"><span className="text-slate-400 text-[10px] font-black uppercase">Adres:</span> <span className="font-bold">{data.details.address}</span></p>
                <p className="flex justify-between border-b pb-3"><span className="text-slate-400 text-[10px] font-black uppercase">NIP:</span> <span className="font-mono font-bold">{data.details.nip}</span></p>
              </div>
           </section>

           <section className="page-break space-y-8 overflow-visible">
              <h3 className="text-3xl font-black uppercase tracking-widest text-slate-900 border-b-8 border-slate-900 pb-4">1. Instrukcje Higieniczne GHP</h3>
              <table className="w-full border-collapse text-sm rounded-3xl overflow-hidden shadow-sm">
                <thead className="bg-slate-900 text-white">
                  <tr><th className="p-4 text-left uppercase text-[10px]">Urządzenie / Obszar</th><th className="p-4 text-left uppercase text-[10px]">Czynność</th><th className="p-4 text-left uppercase text-[10px]">Środek</th><th className="p-4 text-left uppercase text-[10px]">Częstotliwość</th></tr>
                </thead>
                <tbody>
                  {generatedResult.ghpInstructions.map((ghp: any, i: number) => (
                    <tr key={i} className={`hover:bg-blue-50/30 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="p-4 font-black">{ghp.device}</td><td className="p-4">{ghp.action}</td><td className="p-4 italic">{ghp.agent}</td><td className="p-4 font-black text-blue-700">{ghp.frequency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </section>

           {/* New Stat Chart Section */}
           <section className="page-break space-y-8 overflow-visible">
              <h3 className="text-3xl font-black uppercase tracking-widest text-slate-900 border-b-8 border-slate-900 pb-4">2. Podsumowanie Statystyczne Zagrożeń</h3>
              <div className="bg-slate-50 p-10 rounded-[32px] border-2 border-slate-100 flex flex-col md:flex-row items-center gap-12">
                <div className="w-48 h-48 relative flex items-center justify-center">
                  {/* Simple SVG Pie Chart */}
                  <svg viewBox="0 0 32 32" className="w-full h-full transform -rotate-90 rounded-full bg-slate-200">
                    <circle r="16" cx="16" cy="16" fill="transparent" stroke="#3b82f6" strokeWidth="32" strokeDasharray={`${hazardStats.bioPerc} 100`} />
                    <circle r="16" cx="16" cy="16" fill="transparent" stroke="#10b981" strokeWidth="32" strokeDasharray={`${hazardStats.chemPerc} 100`} strokeDashoffset={`-${hazardStats.bioPerc}`} />
                    <circle r="16" cx="16" cy="16" fill="transparent" stroke="#ef4444" strokeWidth="32" strokeDasharray={`${hazardStats.physPerc} 100`} strokeDashoffset={`-${hazardStats.bioPerc + hazardStats.chemPerc}`} />
                  </svg>
                </div>
                <div className="flex-1 space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Biologiczne (B)</span><span className="font-black text-blue-600">{hazardStats.bioPerc}%</span></div>
                    <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${hazardStats.bioPerc}%` }}></div></div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Chemiczne (C)</span><span className="font-black text-emerald-600">{hazardStats.chemPerc}%</span></div>
                    <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${hazardStats.chemPerc}%` }}></div></div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase text-rose-600 tracking-widest">Fizyczne (F)</span><span className="font-black text-rose-600">{hazardStats.physPerc}%</span></div>
                    <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${hazardStats.physPerc}%` }}></div></div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-2">Wyliczone na podstawie analizy {data.menuOrProducts.length} produktów / dań.</p>
                </div>
              </div>
           </section>

           <section className="page-break space-y-10 overflow-visible">
              <h3 className="text-3xl font-black uppercase tracking-widest text-slate-900 border-b-8 border-slate-900 pb-4">3. Analiza Zagrożeń</h3>
              <div className="space-y-12">
                {generatedResult.hazardAnalysis.map((item: any, i: number) => (
                  <div key={i} className="border-2 border-slate-200 rounded-[32px] overflow-visible shadow-sm bg-white">
                    <div className="bg-slate-100 p-6 font-black border-b-2 flex justify-between items-center px-10 rounded-t-[30px]">
                      <span className="uppercase text-slate-800 text-lg">{item.categoryName}</span>
                      <span className="text-[10px] text-slate-400 tracking-widest bg-white px-4 py-2 rounded-full border">PRODUKT: {item.dishName}</span>
                    </div>
                    <div className="p-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-[11px] leading-relaxed">
                      <div className="bg-blue-50/50 p-8 rounded-[24px] border-2 border-blue-100">
                        <h5 className="font-black uppercase tracking-widest text-[10px] mb-3">Biologiczne (B)</h5>
                        <ul className="list-disc pl-5 space-y-3 text-slate-600 font-bold">{item.biological.map((b: string, idx: number) => <li key={idx}>{b}</li>)}</ul>
                      </div>
                      <div className="bg-emerald-50/50 p-8 rounded-[24px] border-2 border-emerald-100">
                        <h5 className="font-black uppercase tracking-widest text-[10px] mb-3">Chemiczne (C)</h5>
                        <ul className="list-disc pl-5 space-y-3 text-slate-600 font-bold">{item.chemical.map((c: string, idx: number) => <li key={idx}>{c}</li>)}</ul>
                      </div>
                      <div className="bg-rose-50/50 p-8 rounded-[24px] border-2 border-rose-100">
                        <h5 className="font-black uppercase tracking-widest text-[10px] mb-3">Fizyczne (F)</h5>
                        <ul className="list-disc pl-5 space-y-3 text-slate-600 font-bold">{item.physical.map((p: string, idx: number) => <li key={idx}>{p}</li>)}</ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
           </section>

           <section className="page-break space-y-10 overflow-visible">
              <h3 className="text-3xl font-black uppercase tracking-widest text-slate-900 border-b-8 border-slate-900 pb-4">4. Punkty Krytyczne (CCP)</h3>
              <div className="grid grid-cols-1 gap-12">
                {generatedResult.ccps.map((ccp: any, i: number) => (
                  <div key={i} className="border-4 border-slate-900 rounded-[40px] overflow-hidden shadow-2xl bg-white">
                    <div className="bg-slate-900 text-white p-6 font-black uppercase flex justify-between items-center px-10">
                      <span>CCP {i+1}: {ccp.title}</span><span className="text-[10px] bg-red-600 px-4 py-2 rounded-full border-2 border-red-500">ALARM KRYTYCZNY</span>
                    </div>
                    <div className="p-12 grid grid-cols-1 md:grid-cols-2 gap-12 text-sm">
                      <div className="space-y-6">
                        <p><span className="font-black uppercase text-[10px] text-slate-400 block mb-2">Zagrożenie:</span> <span className="bg-slate-50 p-4 block rounded-xl border">{ccp.hazard}</span></p>
                        <p><span className="font-black uppercase text-[10px] text-slate-400 block mb-2">Monitoring:</span> <span className="bg-slate-50 p-4 block rounded-xl border">{ccp.monitoring}</span></p>
                      </div>
                      <div className="space-y-6 border-l pl-12">
                        <p><span className="font-black uppercase text-[10px] text-red-400 block mb-2">Limity:</span> <span className="bg-red-50 p-4 block rounded-xl border-2 border-red-100 font-black text-red-700">{ccp.criticalLimits}</span></p>
                        <p><span className="font-black uppercase text-[10px] text-slate-400 block mb-2">Działania:</span> <span className="bg-slate-50 p-4 block rounded-xl border italic">{ccp.correctiveActions}</span></p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
           </section>

           <section className="pt-40 pb-20"><div className="grid grid-cols-2 gap-32 px-10"><div className="text-center"><div className="h-0.5 bg-slate-300 mb-4 rounded-full"></div><p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Opracował / Podpis</p></div><div className="text-center"><div className="h-0.5 bg-slate-300 mb-4 rounded-full"></div><p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Zatwierdził</p></div></div></section>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      <nav className="bg-white border-b px-8 py-5 flex justify-between items-center sticky top-0 z-50 no-print shadow-sm">
        <div className="flex items-center space-x-3"><div className="bg-blue-600 w-11 h-11 flex items-center justify-center rounded-[14px] shadow-xl"><i className="fa-solid fa-file-shield text-white text-xl"></i></div><span className="text-2xl font-black text-slate-900 tracking-tighter">HACCP<span className="text-blue-600 font-normal">.pro</span></span></div>
      </nav>
      <main className="flex-1 container mx-auto px-4 py-16">
        {step < 8 ? (
          <div className="max-w-4xl mx-auto no-print">
            <StepWizard currentStep={step} totalSteps={7} onNext={handleNext} onBack={() => setStep(step-1)} canNext={currentStepConfig[step-1].canNext} isLoading={isGenerating}>
              {currentStepConfig[step-1].component()}
            </StepWizard>
          </div>
        ) : renderFinalResult()}
      </main>
      <footer className="bg-white border-t py-12 no-print text-center text-slate-400 text-xs font-medium uppercase tracking-widest">© 2024 HACCP.pro Professional Compliance System</footer>
    </div>
  );
}
