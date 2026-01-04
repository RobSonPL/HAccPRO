
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { HACCPCategory, HACCPData, Equipment, ProductionStage, Vehicle, Hazard, Supplier, AllergenEntry, DocType } from './types';
import { StepWizard } from './components/StepWizard';
import { generateAIHACCPContent, suggestAllergens, suggestDishes } from './services/geminiService';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } from "docx";
import saveAs from "file-saver";

const INITIAL_DATA: HACCPData = {
  category: HACCPCategory.GASTRONOMY,
  docType: 'HACCP',
  details: { name: '', address: '', nip: '', representative: '' },
  menuOrProducts: [],
  equipment: [],
  stages: [],
  suppliers: [],
  allergenMatrix: [],
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
      const filtered = prev.allergenMatrix.filter(a => products.includes(a.productName));
      const missing = products.filter(p => !filtered.find(a => a.productName === p));
      const newEntries = missing.map(p => ({ productName: p, allergens: [] }));
      return { ...prev, allergenMatrix: [...filtered, ...newEntries] };
    });
  }, [data.menuOrProducts]);

  const handleNext = async () => {
    if (step === 2 && !/^\d{10}$/.test(data.details.nip)) return;
    if (step === 6) {
      setIsGenerating(true);
      try {
        const res = await generateAIHACCPContent(data);
        if (res) {
          setGeneratedResult(res);
          setStep(7);
        } else {
          throw new Error("Pusta odpowiedź z modelu AI.");
        }
      } catch (err) { 
        console.error("Błąd podczas generowania:", err);
        alert("Wystąpił błąd podczas generowania dokumentacji. Spróbuj ponownie lub sprawdź połączenie z internetem."); 
      } finally { 
        setIsGenerating(false); 
      }
    } else {
      setStep(prev => prev + 1);
    }
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = (window as any).html2canvas;
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = (window as any).jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      let hLeft = pdfHeight;
      let pos = 0;
      pdf.addImage(imgData, 'PNG', 0, pos, pdfWidth, pdfHeight);
      hLeft -= pdf.internal.pageSize.getHeight();
      while (hLeft >= 0) {
        pos = hLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, pos, pdfWidth, pdfHeight);
        hLeft -= pdf.internal.pageSize.getHeight();
      }
      pdf.save(`HACCP_${data.details.name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) { 
      console.error(e);
      alert("Błąd podczas eksportu do PDF."); 
    } finally { 
      setIsExporting(false); 
    }
  };

  const exportToDOCX = async () => {
    if (!generatedResult) return;
    setIsExportingDoc(true);
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({ text: `System ${data.docType}`, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: data.details.name, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: data.details.address, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: "", spacing: { after: 400 } }),

            new Paragraph({ text: "1. Warunki pracy", heading: HeadingLevel.HEADING_3 }),
            new Paragraph({ text: `Temperatura: ${data.workingConditions.temperature}` }),
            new Paragraph({ text: `Wilgotność: ${data.workingConditions.humidity}` }),
            new Paragraph({ text: `Wentylacja: ${data.workingConditions.ventilation}` }),

            new Paragraph({ text: "2. Instrukcje GHP", heading: HeadingLevel.HEADING_3 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: ["Urządzenie", "Czynność", "Środek", "Częstotliwość"].map(t => new TableCell({ children: [new Paragraph({ text: t, bold: true })] }))
                }),
                ...generatedResult.ghpInstructions.map((ghp: any) => new TableRow({
                  children: [ghp.device, ghp.action, ghp.agent, ghp.frequency].map(t => new TableCell({ children: [new Paragraph({ text: t })] }))
                }))
              ]
            }),

            new Paragraph({ text: "3. Punkty Krytyczne Kontroli (CCP)", heading: HeadingLevel.HEADING_3 }),
            ...generatedResult.ccps.flatMap((ccp: any, i: number) => [
              new Paragraph({ text: `CCP ${i+1}: ${ccp.title}`, bold: true }),
              new Paragraph({ text: `Zagrożenie: ${ccp.hazard}` }),
              new Paragraph({ text: `Monitoring: ${ccp.monitoring}` }),
              new Paragraph({ text: `Limity: ${ccp.criticalLimits}` }),
              new Paragraph({ text: `Działania: ${ccp.correctiveActions}` }),
              new Paragraph({ text: "" })
            ])
          ]
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Dokumentacja_${data.details.name.replace(/\s+/g, '_')}.docx`);
    } catch (e) {
      console.error(e);
      alert("Błąd podczas eksportu do DOCX.");
    } finally {
      setIsExportingDoc(false);
    }
  };

  const currentStepConfig = useMemo(() => [
    { component: () => (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-800">Typ działalności i dokumentu</h2>
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
        <h3 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-widest">Wybierz branżę:</h3>
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
        <h2 className="text-2xl font-bold text-slate-800">Dane Podmiotu</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nazwa Firmy</label>
            <input placeholder="Pełna nazwa firmy" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition-all" value={data.details.name} onChange={e => updateDetails('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">NIP</label>
            <input placeholder="10 cyfr" className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition-all ${nipError ? 'border-red-300' : ''}`} value={data.details.nip} onChange={e => updateDetails('nip', e.target.value)} maxLength={10} />
            {nipError && <p className="text-red-500 text-[10px] ml-1 font-bold">{nipError}</p>}
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Adres prowadzenia działalności</label>
            <input placeholder="Ulica, Numer, Kod pocztowy, Miasto" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition-all" value={data.details.address} onChange={e => updateDetails('address', e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Osoba odpowiedzialna</label>
            <input placeholder="Imię i Nazwisko właściciela lub kierownika" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition-all" value={data.details.representative} onChange={e => updateDetails('representative', e.target.value)} />
          </div>
        </div>
      </div>
    ), canNext: !!data.details.name && /^\d{10}$/.test(data.details.nip) },
    { component: () => (
      <div className="space-y-6">
        <div className="flex justify-between items-end mb-2">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Menu i Produkty</h2>
            <p className="text-xs text-slate-500 font-medium">Wypisz kluczowe grupy dań lub konkretne potrawy.</p>
          </div>
          <button onClick={handleSuggestDishes} disabled={isSuggestingDishes} className="text-xs bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-black border border-indigo-100 flex items-center hover:bg-indigo-100 transition-all">
            {isSuggestingDishes ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>}
            SUGERUJ AI
          </button>
        </div>
        
        {suggestedDishesList.length > 0 && (
          <div className="bg-slate-50 p-5 rounded-2xl border animate-fade-in shadow-inner">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Podpowiedzi dla Twojej branży:</h3>
            <div className="flex flex-wrap gap-2">
              {suggestedDishesList.map(dish => (
                <button key={dish} onClick={() => toggleMenuItem(dish)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${data.menuOrProducts.includes(dish) ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 hover:border-indigo-400'}`}>
                  {dish}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <input id="dish-input" placeholder="Wpisz nazwę i naciśnij Enter..." className="w-full p-4 border rounded-2xl focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm" onKeyDown={e => {
            if (e.key === 'Enter') {
              const val = (e.target as HTMLInputElement).value.trim();
              if (val) { toggleMenuItem(val); (e.target as HTMLInputElement).value = ''; }
            }
          }} />
          <div className="flex flex-wrap gap-3">
            {data.menuOrProducts.length === 0 && <p className="text-slate-400 text-sm italic py-4">Brak dodanych produktów. Dodaj je powyżej lub skorzystaj z sugestii AI.</p>}
            {data.menuOrProducts.map(dish => (
              <span key={dish} className="bg-white border-2 border-blue-100 text-blue-900 px-4 py-2 rounded-xl text-xs font-black flex items-center shadow-sm animate-fade-in">
                {dish} <button onClick={() => toggleMenuItem(dish)} className="ml-3 text-red-400 hover:text-red-600 font-bold transition-colors">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>
    ), canNext: data.menuOrProducts.length > 0 },
    { component: () => (
      <div className="space-y-8">
        <h2 className="text-2xl font-bold text-slate-800">Inwentarz Sprzętowy</h2>
        <div className="bg-slate-50 p-6 rounded-2xl border shadow-inner">
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Wybierz posiadany sprzęt:</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_EQUIPMENT.map(name => {
              const isSel = data.equipment.some(e => e.name === name);
              return (
                <button key={name} onClick={() => toggleCommonEquipment(name)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${isSel ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-white text-slate-600 hover:border-emerald-400'}`}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          {data.equipment.length === 0 && <p className="text-center py-10 text-slate-400 text-sm italic">Wybierz sprzęt powyżej, aby dodać go do dokumentacji.</p>}
          {data.equipment.map(eq => (
            <div key={eq.id} className="flex gap-3 animate-fade-in group">
              <div className="flex-1 bg-white p-3 border-2 border-slate-100 rounded-xl font-bold text-slate-700 flex items-center">
                <i className="fa-solid fa-check-circle text-emerald-500 mr-3"></i>
                {eq.name}
              </div>
              <button onClick={() => setData(prev => ({ ...prev, equipment: prev.equipment.filter(i => i.id !== eq.id) }))} className="bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 w-12 rounded-xl transition-all">
                <i className="fa-solid fa-trash-can"></i>
              </button>
            </div>
          ))}
        </div>
      </div>
    ), canNext: data.equipment.length > 0 },
    { component: () => (
      <div className="space-y-8">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Zagrożenia i Alergeny</h2>
            <p className="text-xs text-slate-500 font-medium">Dostosuj macierz alergenów dla każdego produktu.</p>
          </div>
          <button onClick={handleSuggestAllergens} disabled={isSuggestingAllergens} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
            {isSuggestingAllergens ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>}
            ANALYZE ALLERGENS (AI)
          </button>
        </div>
        <div className="overflow-x-auto border rounded-2xl shadow-xl bg-white">
          <table className="w-full text-[10px] text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4 border-b sticky left-0 bg-slate-50 z-10 font-black uppercase text-slate-400 tracking-wider">Produkt / Danie</th>
                {ALLERGENS_LIST.map(a => <th key={a} className="p-1 rotate-90 h-36 border-l border-b text-slate-500 font-bold whitespace-nowrap">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.allergenMatrix.map(entry => (
                <tr key={entry.productName} className="border-b hover:bg-blue-50/30 transition-colors">
                  <td className="p-4 font-black border-r sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)]">{entry.productName}</td>
                  {ALLERGENS_LIST.map(a => (
                    <td key={a} className="p-2 text-center border-l">
                      <input type="checkbox" className="w-5 h-5 text-blue-600 cursor-pointer rounded-lg border-slate-300 focus:ring-blue-500" checked={entry.allergens.includes(a)} onChange={() => {
                        setData(prev => ({
                          ...prev,
                          allergenMatrix: prev.allergenMatrix.map(am => am.productName === entry.productName 
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
        <h2 className="text-2xl font-bold text-slate-800">Warunki środowiskowe</h2>
        <p className="text-sm text-slate-500 -mt-4">Dane te są niezbędne do precyzyjnej oceny ryzyka mikrobiologicznego przez silnik AI.</p>
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white p-8 rounded-2xl border-2 border-slate-100 space-y-6 shadow-sm">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Temperatura otoczenia w strefie przygotowywania</label>
              <input placeholder="np. +18°C do +22°C" className="w-full p-4 border rounded-xl focus:ring-4 focus:ring-blue-50 outline-none transition-all" value={data.workingConditions.temperature} onChange={e => setData(prev => ({ ...prev, workingConditions: { ...prev.workingConditions, temperature: e.target.value } }))} />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Wilgotność względna powietrza</label>
              <input placeholder="np. 45% - 60%" className="w-full p-4 border rounded-xl focus:ring-4 focus:ring-blue-50 outline-none transition-all" value={data.workingConditions.humidity} onChange={e => setData(prev => ({ ...prev, workingConditions: { ...prev.workingConditions, humidity: e.target.value } }))} />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Rodzaj i wydajność wentylacji</label>
              <input placeholder="np. Mechaniczna, nawiewno-wywiewna z filtrami" className="w-full p-4 border rounded-xl focus:ring-4 focus:ring-blue-50 outline-none transition-all" value={data.workingConditions.ventilation} onChange={e => setData(prev => ({ ...prev, workingConditions: { ...prev.workingConditions, ventilation: e.target.value } }))} />
            </div>
          </div>
        </div>
      </div>
    ), canNext: !!data.workingConditions.temperature && !!data.workingConditions.humidity && !!data.workingConditions.ventilation }
  ], [data, nipError, isSuggestingDishes, suggestedDishesList, isSuggestingAllergens]);

  const renderFinalResult = () => {
    if (!generatedResult) return (
      <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
        <div className="relative w-24 h-24 mb-6">
          <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          <i className="fa-solid fa-robot absolute inset-0 flex items-center justify-center text-3xl text-blue-600"></i>
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-2">Trwa analiza danych przez AI...</h2>
        <p className="text-slate-500 font-medium">Przygotowujemy profesjonalny operat sanitarny dla {data.details.name}.</p>
      </div>
    );
    
    return (
      <div className="max-w-5xl mx-auto animate-fade-in pb-20">
        <div className="bg-slate-900 text-white p-8 rounded-3xl mb-10 flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl no-print border-b-8 border-blue-600">
          <div>
            <h1 className="text-3xl font-black tracking-tighter">Dokumentacja Wygenerowana</h1>
            <p className="text-slate-400 text-sm font-medium mt-1">Kompletna księga sanitarna zgodna z wymogami polskiego prawa.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={exportToPDF} disabled={isExporting} className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-3.5 rounded-2xl font-black flex items-center shadow-lg shadow-rose-900/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
              {isExporting ? <i className="fa-solid fa-spinner fa-spin mr-3"></i> : <i className="fa-solid fa-file-pdf mr-3"></i>} EKSPORT PDF
            </button>
            <button onClick={exportToDOCX} disabled={isExportingDoc} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-2xl font-black flex items-center shadow-lg shadow-blue-900/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
              {isExportingDoc ? <i className="fa-solid fa-spinner fa-spin mr-3"></i> : <i className="fa-solid fa-file-word mr-3"></i>} EKSPORT WORD
            </button>
          </div>
        </div>

        <div ref={reportRef} className="bg-white p-12 border shadow-2xl print:shadow-none print:border-none space-y-20 text-slate-900 leading-relaxed font-inter">
           {/* Report Sections */}
           <section className="text-center py-32 border-[16px] border-double border-slate-100 p-10 page-break rounded-[40px]">
              <div className="mb-10 opacity-20"><i className="fa-solid fa-file-shield text-8xl"></i></div>
              <h2 className="text-5xl font-black mb-4 uppercase tracking-tighter text-slate-900">System Bezpieczeństwa Żywności</h2>
              <h3 className="text-2xl font-black text-blue-600 uppercase mb-12 tracking-widest">{data.docType}</h3>
              <div className="h-2 w-48 bg-slate-900 mx-auto mb-16 rounded-full"></div>
              <div className="max-w-2xl mx-auto bg-slate-50 p-12 rounded-[32px] border-2 border-slate-100 text-left space-y-6 shadow-inner">
                <div className="flex justify-between border-b-2 border-slate-100 pb-3">
                  <span className="text-slate-400 uppercase text-[10px] font-black tracking-widest">Podmiot Gospodarczy:</span>
                  <span className="font-black uppercase text-slate-900">{data.details.name}</span>
                </div>
                <div className="flex justify-between border-b-2 border-slate-100 pb-3">
                  <span className="text-slate-400 uppercase text-[10px] font-black tracking-widest">Lokalizacja Zakładu:</span>
                  <span className="font-bold text-slate-800">{data.details.address}</span>
                </div>
                <div className="flex justify-between border-b-2 border-slate-100 pb-3">
                  <span className="text-slate-400 uppercase text-[10px] font-black tracking-widest">Identyfikacja NIP:</span>
                  <span className="font-mono font-bold text-slate-700">{data.details.nip}</span>
                </div>
                <div className="flex justify-between border-b-2 border-slate-100 pb-3">
                  <span className="text-slate-400 uppercase text-[10px] font-black tracking-widest">Osoba Zarządzająca:</span>
                  <span className="font-bold text-slate-800">{data.details.representative}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 uppercase text-[10px] font-black tracking-widest">Data Zatwierdzenia:</span>
                  <span className="font-black text-blue-600">{new Date().toLocaleDateString('pl-PL')}</span>
                </div>
              </div>
              <div className="mt-20 text-[10px] text-slate-300 font-black uppercase tracking-widest">Dokumentacja generowana systemowo - HACCP.pro Professional Edition</div>
           </section>

           <section className="page-break space-y-8">
              <div className="flex items-center gap-4 border-b-8 border-slate-900 pb-6">
                <div className="bg-slate-900 text-white w-14 h-14 flex items-center justify-center rounded-2xl font-black text-2xl shadow-lg">1</div>
                <h3 className="text-3xl font-black uppercase tracking-widest text-slate-900">Instrukcje Higieniczne GHP</h3>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 mb-8">
                <p className="text-xs text-slate-500 italic">Poniższe instrukcje stanowią integralną część systemu Dobrych Praktyk Higienicznych. Personel ma obowiązek stosować się do wytycznych mycia i dezynfekcji urządzeń.</p>
              </div>
              <table className="w-full border-collapse text-sm rounded-3xl overflow-hidden shadow-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-4 text-left font-black uppercase text-[10px] tracking-wider">Urządzenie / Obszar</th>
                    <th className="p-4 text-left font-black uppercase text-[10px] tracking-wider">Czynność mycia/dezynfekcji</th>
                    <th className="p-4 text-left font-black uppercase text-[10px] tracking-wider">Środek roboczy</th>
                    <th className="p-4 text-left font-black uppercase text-[10px] tracking-wider">Częstotliwość</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedResult.ghpInstructions.map((ghp: any, i: number) => (
                    <tr key={i} className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="border-b border-slate-100 p-4 font-black text-slate-800">{ghp.device}</td>
                      <td className="border-b border-slate-100 p-4 text-slate-600">{ghp.action}</td>
                      <td className="border-b border-slate-100 p-4 italic text-slate-500">{ghp.agent}</td>
                      <td className="border-b border-slate-100 p-4 font-black text-blue-700">{ghp.frequency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </section>

           <section className="page-break space-y-10">
              <div className="flex items-center gap-4 border-b-8 border-slate-900 pb-6">
                <div className="bg-slate-900 text-white w-14 h-14 flex items-center justify-center rounded-2xl font-black text-2xl shadow-lg">2</div>
                <h3 className="text-3xl font-black uppercase tracking-widest text-slate-900">Karty Punktów Krytycznych (CCP)</h3>
              </div>
              <div className="grid grid-cols-1 gap-12">
                {generatedResult.ccps.map((ccp: any, i: number) => (
                  <div key={i} className="border-4 border-slate-900 rounded-[40px] overflow-hidden shadow-2xl transition-transform hover:scale-[1.01]">
                    <div className="bg-slate-900 text-white p-6 font-black uppercase flex justify-between items-center px-10">
                      <span className="text-xl tracking-tight">CCP {i+1}: {ccp.title}</span>
                      <span className="text-[10px] bg-red-600 px-4 py-2 rounded-full border-2 border-red-500 shadow-lg tracking-widest">ALARM KRYTYCZNY</span>
                    </div>
                    <div className="p-12 grid grid-cols-1 md:grid-cols-2 gap-12 text-sm bg-white">
                      <div className="space-y-6">
                        <div>
                          <span className="font-black uppercase text-[10px] text-slate-400 block mb-2 tracking-widest">Zagrożenie Zdrowotne:</span>
                          <p className="text-slate-800 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">{ccp.hazard}</p>
                        </div>
                        <div>
                          <span className="font-black uppercase text-[10px] text-slate-400 block mb-2 tracking-widest">Sposób Monitorowania:</span>
                          <p className="text-slate-800 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">{ccp.monitoring}</p>
                        </div>
                      </div>
                      <div className="space-y-6 border-l-2 pl-12 border-slate-100">
                        <div>
                          <span className="font-black uppercase text-[10px] text-red-400 block mb-2 tracking-widest">Granice / Limity Krytyczne:</span>
                          <p className="text-red-700 font-black text-lg bg-red-50 p-4 rounded-2xl border-2 border-red-100 shadow-inner">{ccp.criticalLimits}</p>
                        </div>
                        <div>
                          <span className="font-black uppercase text-[10px] text-slate-400 block mb-2 tracking-widest">Działania Korygujące (REAKCJA):</span>
                          <p className="text-slate-800 font-medium italic bg-slate-50 p-4 rounded-2xl border border-slate-100">{ccp.correctiveActions}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
           </section>

           <section className="page-break space-y-10">
              <div className="flex items-center gap-4 border-b-8 border-slate-900 pb-6">
                <div className="bg-slate-900 text-white w-14 h-14 flex items-center justify-center rounded-2xl font-black text-2xl shadow-lg">3</div>
                <h3 className="text-3xl font-black uppercase tracking-widest text-slate-900">Szczegółowa Analiza Zagrożeń</h3>
              </div>
              <div className="space-y-10">
                {generatedResult.hazardAnalysis.map((item: any, i: number) => (
                  <div key={i} className="border-2 border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
                    <div className="bg-slate-100 p-6 font-black border-b-2 border-slate-200 flex justify-between items-center px-10">
                      <span className="uppercase text-slate-800 tracking-tight">{item.categoryName}</span>
                      <span className="text-[10px] text-slate-400 tracking-widest bg-white px-4 py-2 rounded-full border border-slate-200">PRODUKT: {item.dishName}</span>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-[11px] leading-tight">
                      <div className="bg-blue-50/50 p-6 rounded-[24px] border-2 border-blue-100">
                        <div className="flex items-center gap-2 mb-3 text-blue-900">
                          <i className="fa-solid fa-microbe"></i>
                          <h5 className="font-black uppercase tracking-widest text-[9px]">Biologiczne (B)</h5>
                        </div>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600 font-medium">
                          {item.biological.map((b: string, idx: number) => <li key={idx}>{b}</li>)}
                        </ul>
                      </div>
                      <div className="bg-emerald-50/50 p-6 rounded-[24px] border-2 border-emerald-100">
                        <div className="flex items-center gap-2 mb-3 text-emerald-900">
                          <i className="fa-solid fa-vial"></i>
                          <h5 className="font-black uppercase tracking-widest text-[9px]">Chemiczne (C)</h5>
                        </div>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600 font-medium">
                          {item.chemical.map((c: string, idx: number) => <li key={idx}>{c}</li>)}
                        </ul>
                      </div>
                      <div className="bg-rose-50/50 p-6 rounded-[24px] border-2 border-rose-100">
                        <div className="flex items-center gap-2 mb-3 text-rose-900">
                          <i className="fa-solid fa-magnifying-glass"></i>
                          <h5 className="font-black uppercase tracking-widest text-[9px]">Fizyczne (F)</h5>
                        </div>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600 font-medium">
                          {item.physical.map((p: string, idx: number) => <li key={idx}>{p}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
           </section>

           <section className="pt-40">
              <div className="grid grid-cols-2 gap-32 px-10">
                <div className="text-center">
                  <div className="h-0.5 bg-slate-300 mb-4 rounded-full"></div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Opracował / Podpis Właściciela</p>
                </div>
                <div className="text-center">
                  <div className="h-0.5 bg-slate-300 mb-4 rounded-full"></div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Miejsce i Data Zatwierdzenia</p>
                </div>
              </div>
           </section>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter selection:bg-blue-100 selection:text-blue-900">
      <nav className="bg-white border-b px-8 py-5 flex justify-between items-center sticky top-0 z-50 no-print shadow-sm backdrop-blur-md bg-white/90">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 w-11 h-11 flex items-center justify-center rounded-[14px] shadow-xl shadow-blue-200 group transition-all hover:scale-105">
            <i className="fa-solid fa-file-shield text-white text-xl"></i>
          </div>
          <span className="text-2xl font-black text-slate-900 tracking-tighter">HACCP<span className="text-blue-600 font-normal">.pro</span></span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-0.5">Automatyczny System Sanitarny</span>
            <span className="text-[10px] font-bold text-emerald-500 flex items-center">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
              Gemini 3 Flash Powered
            </span>
          </div>
          <div className="h-8 w-px bg-slate-100 hidden md:block"></div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-400 hover:text-blue-600 transition-colors cursor-help">
            <i className="fa-solid fa-circle-question"></i>
          </div>
        </div>
      </nav>
      
      <main className="flex-1 container mx-auto px-4 py-16">
        {step < 7 ? (
          <div className="max-w-4xl mx-auto no-print">
            <div className="text-center mb-12">
              <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">Generator <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">HACCP Pro</span></h1>
              <p className="text-slate-500 font-medium text-lg max-w-2xl mx-auto">Profesjonalna dokumentacja sanitarna wygenerowana w kilka minut przy użyciu zaawansowanej sztucznej inteligencji.</p>
            </div>
            <StepWizard 
              currentStep={step} 
              totalSteps={6} 
              onNext={handleNext} 
              onBack={() => setStep(step-1)} 
              canNext={currentStepConfig[step-1].canNext} 
              isLoading={isGenerating}
            >
              {currentStepConfig[step-1].component()}
            </StepWizard>
          </div>
        ) : renderFinalResult()}
      </main>
      
      <footer className="bg-white border-t py-12 no-print">
        <div className="container mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col gap-1">
            <p className="text-slate-900 font-black text-sm tracking-tighter">HACCP.pro</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Wsparcie Techniczne Sanepidu 2.0</p>
          </div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-widest text-center">© 2024 Wszystkie prawa zastrzeżone. System zgodny z ISO 22000 i Codex Alimentarius.</p>
          <div className="flex gap-4 text-slate-300 transition-all">
            <i className="fa-brands fa-cc-visa text-3xl hover:text-blue-600 cursor-pointer"></i>
            <i className="fa-brands fa-cc-mastercard text-3xl hover:text-rose-500 cursor-pointer"></i>
            <i className="fa-brands fa-cc-apple-pay text-3xl hover:text-slate-900 cursor-pointer"></i>
          </div>
        </div>
      </footer>
    </div>
  );
}
