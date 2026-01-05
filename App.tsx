
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { HACCPCategory, HACCPData, Equipment, ProductionStage, Vehicle, Hazard, Supplier, AllergenEntry, DocType, ProductHazard, ProductEntry, SOPBlock, GHPDetail } from './types';
import { StepWizard } from './components/StepWizard';
import { generateAIHACCPContent, suggestAllergens, suggestDishes, suggestSOPsByCategory, suggestProductHazards, suggestStages } from './services/geminiService';
import { Document, Packer, Paragraph, HeadingLevel, AlignmentType } from "docx";
import * as FileSaver from "file-saver";

const INITIAL_DATA: HACCPData = {
  category: HACCPCategory.GASTRONOMY,
  docType: 'HACCP',
  details: { name: '', address: '', nip: '', representative: '' },
  menuOrProducts: [],
  equipment: [],
  stages: [],
  suppliers: [],
  ghpDetails: [],
  allergenMatrix: [],
  productHazards: [],
  fleet: [],
  workingConditions: { temperature: '', humidity: '', ventilation: '' },
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
  const [genProgress, setGenProgress] = useState(0);
  const [genStatus, setGenStatus] = useState('');
  
  const [isSuggestingAllergens, setIsSuggestingAllergens] = useState(false);
  const [isSuggestingDishes, setIsSuggestingDishes] = useState(false);
  const [isSuggestingHazards, setIsSuggestingHazards] = useState(false);
  const [isSuggestingStages, setIsSuggestingStages] = useState(false);
  const [isSuggestingSOPs, setIsSuggestingSOPs] = useState(false);
  const [suggestedDishesList, setSuggestedDishesList] = useState<ProductEntry[]>([]);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDoc, setIsExportingDoc] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [nipError, setNipError] = useState<string | null>(null);
  
  const [manualEquipment, setManualEquipment] = useState('');
  const [manualSupplier, setManualSupplier] = useState({ name: '', products: '', contact: '' });
  const [manualGHP, setManualGHP] = useState({ equipmentName: '', frequency: '', cleaningAgent: '' });
  
  const [allergenSearch, setAllergenSearch] = useState('');
  const [allergenTypeFilter, setAllergenTypeFilter] = useState<'all' | ProductEntry['type']>('all');

  const reportRef = useRef<HTMLDivElement>(null);

  const validateNip = (value: string) => {
    const nipRegex = /^\d{10}$/;
    if (!value) { setNipError(null); return false; }
    if (!nipRegex.test(value)) { setNipError('NIP musi mieć 10 cyfr.'); return false; }
    setNipError(null); return true;
  };

  const updateDetails = (field: keyof HACCPData['details'], value: string) => {
    if (field === 'nip') validateNip(value);
    setData(prev => ({ ...prev, details: { ...prev.details, [field]: value } }));
  };

  // Fixed: Added toggleCommonEquipment implementation
  const toggleCommonEquipment = (name: string) => {
    setData(prev => {
      const exists = prev.equipment.find(e => e.name === name);
      if (exists) {
        return { ...prev, equipment: prev.equipment.filter(e => e.name !== name) };
      } else {
        return { 
          ...prev, 
          equipment: [...prev.equipment, { id: Math.random().toString(), name, count: 1 }] 
        };
      }
    });
  };

  const toggleMenuItem = (product: ProductEntry) => {
    setData(prev => ({
      ...prev,
      menuOrProducts: prev.menuOrProducts.find(p => p.name === product.name) 
        ? prev.menuOrProducts.filter(p => p.name !== product.name) 
        : [...prev.menuOrProducts, product]
    }));
  };

  const handleSuggestDishes = async () => {
    setIsSuggestingDishes(true);
    const dishes = await suggestDishes(data.category);
    setSuggestedDishesList(dishes || []);
    setIsSuggestingDishes(false);
  };

  const handleSuggestHazards = async () => {
    if (data.menuOrProducts.length === 0) return;
    setIsSuggestingHazards(true);
    const hazards = await suggestProductHazards(data.menuOrProducts.map(p => p.name));
    setData(prev => ({ ...prev, productHazards: hazards || [] }));
    setIsSuggestingHazards(false);
  };

  const handleSuggestStages = async () => {
    setIsSuggestingStages(true);
    const stages = await suggestStages(data.category);
    setData(prev => ({ ...prev, stages: (stages || []).map((s: any) => ({ ...s, id: Math.random().toString() })) }));
    setIsSuggestingStages(false);
  };

  const handleAddSupplier = () => {
    if (!manualSupplier.name.trim()) return;
    setData(prev => ({ ...prev, suppliers: [...prev.suppliers, { ...manualSupplier, id: Math.random().toString() }] }));
    setManualSupplier({ name: '', products: '', contact: '' });
  };

  const handleAddGHP = () => {
    if (!manualGHP.equipmentName.trim()) return;
    setData(prev => ({ ...prev, ghpDetails: [...prev.ghpDetails, manualGHP] }));
    setManualGHP({ equipmentName: '', frequency: '', cleaningAgent: '' });
  };

  const handleSuggestAllergens = async () => {
    if (data.menuOrProducts.length === 0) return;
    setIsSuggestingAllergens(true);
    const suggestions = await suggestAllergens(data.menuOrProducts.map(p => p.name));
    if (suggestions) {
      setData(prev => ({
        ...prev,
        allergenMatrix: prev.allergenMatrix.map(entry => {
          const suggestion = (suggestions as any[]).find((s: any) => s.dish === entry.productName);
          return suggestion ? { ...entry, allergens: suggestion.allergens || [] } : entry;
        })
      }));
    }
    setIsSuggestingAllergens(false);
  };

  const handleSuggestSOPs = async () => {
    setIsSuggestingSOPs(true);
    try {
      const sops = await suggestSOPsByCategory(data.category);
      if (sops) {
        setData(prev => ({ ...prev, sopBlocks: sops.map((s: any) => ({ id: Math.random().toString(), title: s.title, content: s.content })) }));
      }
    } catch (e) { alert("Błąd podczas sugerowania SOP."); } finally { setIsSuggestingSOPs(false); }
  };

  const handleNext = async () => {
    if (step === 2 && (!data.details.name || !/^\d{10}$/.test(data.details.nip))) return;
    
    if (step === 9) {
      setIsGenerating(true);
      setGenProgress(0);
      setGenStatus('Inicjowanie kreatora dokumentacji...');

      const statuses = [
        { progress: 15, msg: 'Generowanie Księgi GHP/GMP...' },
        { progress: 40, msg: 'Analiza Zagrożeń i Alergenów...' },
        { progress: 65, msg: 'Identyfikacja Punktów CCP...' },
        { progress: 85, msg: 'Budowanie procedur SOP dla branży...' },
        { progress: 100, msg: 'Finalizowanie raportu...' }
      ];

      for (let s of statuses) {
        await new Promise(r => setTimeout(r, 600));
        setGenProgress(s.progress);
        setGenStatus(s.msg);
      }
      
      try {
        const res = await generateAIHACCPContent(data);
        if (res && typeof res === 'object') {
          setGeneratedResult(res);
          setData(prev => ({
            ...prev,
            sopBlocks: res.sops ? res.sops.map((s: any) => ({ id: Math.random().toString(), title: s.title, content: s.content })) : prev.sopBlocks
          }));
          setStep(10);
        }
      } catch (err: any) { alert(`Błąd generowania. Spróbuj ponownie.`); } finally { setIsGenerating(false); }
    } else {
      setStep(prev => prev + 1);
    }
  };

  const hazardStats = useMemo(() => {
    const stats = { bio: 0, chem: 0, phys: 0 };
    (data.productHazards || []).forEach(h => {
      if ((h.biological || "").trim()) stats.bio++;
      if ((h.chemical || "").trim()) stats.chem++;
      if ((h.physical || "").trim()) stats.phys++;
    });
    const total = stats.bio + stats.chem + stats.phys || 1;
    return { bio: stats.bio, chem: stats.chem, phys: stats.phys, total };
  }, [data.productHazards]);

  const ccpStats = useMemo(() => {
    if (!generatedResult || !generatedResult.ccps) return { bio: 0, chem: 0, phys: 0, total: 1 };
    const stats = { bio: 0, chem: 0, phys: 0 };
    generatedResult.ccps.forEach((c: any) => {
      if (c.hazardType === 'Biologiczne') stats.bio++;
      else if (c.hazardType === 'Chemiczne') stats.chem++;
      else stats.phys++;
    });
    return { ...stats, total: stats.bio + stats.chem + stats.phys || 1 };
  }, [generatedResult]);

  const filteredAllergenProducts = useMemo(() => {
    return data.menuOrProducts.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(allergenSearch.toLowerCase());
      const matchesType = allergenTypeFilter === 'all' || p.type === allergenTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [data.menuOrProducts, allergenSearch, allergenTypeFilter]);

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const { jsPDF } = (window as any).jspdf;
      const html2canvas = (window as any).html2canvas;
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/png');
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
      pdf.save(`HACCP_${data.details.name}.pdf`);
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
            ...(data.sopBlocks || []).flatMap(sop => [
              new Paragraph({ text: sop.title, bold: true, spacing: { before: 200 } }),
              new Paragraph({ text: sop.content }),
            ]),
          ]
        }]
      });
      const blob = await Packer.toBlob(doc);
      FileSaver.saveAs(blob, `HACCP_${data.details.name}.docx`);
    } catch (e) { alert("Błąd Word."); } finally { setIsExportingDoc(false); }
  };

  const currentStepConfig = useMemo(() => [
    { id: 1, component: () => (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-800">Typ i branża</h2>
        <div className="bg-slate-50 p-6 rounded-xl border">
          <div className="flex flex-wrap gap-4">
            {DOC_TYPES.map(type => (
              <label key={type} className={`flex-1 min-w-[120px] p-3 rounded-xl border-2 cursor-pointer transition-all text-center ${data.docType === type ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}>
                <input type="radio" className="hidden" name="docType" checked={data.docType === type} onChange={() => setData(prev => ({ ...prev, docType: type }))} /> {type}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CATEGORIES_CONFIG.map(cat => (
            <button key={cat.id} onClick={() => setData(prev => ({ ...prev, category: cat.id }))} className={`p-6 rounded-2xl border-2 text-left ${data.category === cat.id ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}>
              <i className={`fa-solid ${cat.icon} text-xl mb-4 block`}></i> {cat.label}
            </button>
          ))}
        </div>
      </div>
    ), canNext: true },
    { id: 2, component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Dane i Sprzęt</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input placeholder="Nazwa Firmy" className="p-3 border rounded-xl" value={data.details.name} onChange={e => updateDetails('name', e.target.value)} />
          <input placeholder="NIP" className={`p-3 border rounded-xl ${nipError ? 'border-red-500' : ''}`} value={data.details.nip} onChange={e => updateDetails('nip', e.target.value)} maxLength={10} />
          <input placeholder="Adres" className="p-3 border rounded-xl md:col-span-2" value={data.details.address} onChange={e => updateDetails('address', e.target.value)} />
        </div>
        <div className="bg-slate-50 p-6 rounded-2xl border">
          <div className="flex flex-wrap gap-2 mb-4">
            {COMMON_EQUIPMENT.map(name => (
              <button key={name} onClick={() => toggleCommonEquipment(name)} className={`px-4 py-2 rounded-xl text-xs font-bold border ${data.equipment.some(e => e.name === name) ? 'bg-emerald-600 text-white' : 'bg-white'}`}>{name}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input placeholder="Inny sprzęt..." className="flex-1 p-3 border rounded-xl" value={manualEquipment} onChange={e => setManualEquipment(e.target.value)} />
            <button onClick={() => { if(manualEquipment) setData(prev => ({ ...prev, equipment: [...prev.equipment, {id: Math.random().toString(), name: manualEquipment, count: 1}] })); setManualEquipment(''); }} className="bg-slate-900 text-white px-6 rounded-xl">DODAJ</button>
          </div>
        </div>
      </div>
    ), canNext: !!data.details.name && !!data.details.nip },
    { id: 3, component: () => (
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <h2 className="text-2xl font-bold text-slate-800">Menu i Produkty</h2>
          <button onClick={handleSuggestDishes} disabled={isSuggestingDishes} className="bg-slate-900 text-white px-6 py-2 rounded-2xl font-bold">SUGESTIE AI</button>
        </div>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto bg-slate-50 p-4 rounded-xl border">
          {suggestedDishesList.map(dish => (
            <button key={dish.name} onClick={() => toggleMenuItem(dish)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${data.menuOrProducts.some(p => p.name === dish.name) ? 'bg-indigo-600 text-white' : 'bg-white'}`}>{dish.name}</button>
          ))}
        </div>
      </div>
    ), canNext: data.menuOrProducts.length > 0 },
    { id: 4, component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Etapy Produkcji</h2>
        <button onClick={handleSuggestStages} disabled={isSuggestingStages} className="bg-slate-900 text-white px-6 py-2 rounded-xl">SUGESTIE AI</button>
        {data.stages.map(s => <div key={s.id} className="p-3 border rounded-lg bg-white flex justify-between">{s.name} <button onClick={() => setData(prev => ({ ...prev, stages: prev.stages.filter(x => x.id !== s.id) }))}>USUŃ</button></div>)}
      </div>
    ), canNext: data.stages.length >= 3 },
    { id: 5, component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Alergeny</h2>
        <button onClick={handleSuggestAllergens} disabled={isSuggestingAllergens} className="bg-slate-900 text-white px-6 py-2 rounded-xl">ANALIZUJ SKŁAD AI</button>
        <div className="max-h-60 overflow-y-auto border rounded-xl bg-white">
          <table className="w-full text-xs text-left">
            <thead><tr className="bg-slate-50"><th className="p-2">Produkt</th>{ALLERGENS_LIST.map(a => <th key={a} className="p-2 border-l rotate-90 h-24">{a}</th>)}</tr></thead>
            <tbody>
              {data.menuOrProducts.map(p => (
                <tr key={p.name} className="border-t">
                  <td className="p-2 font-bold">{p.name}</td>
                  {ALLERGENS_LIST.map(a => (
                    <td key={a} className="p-2 text-center border-l">
                      <input type="checkbox" checked={data.allergenMatrix.find(am => am.productName === p.name)?.allergens.includes(a)} onChange={() => {
                        setData(prev => ({
                          ...prev, allergenMatrix: prev.allergenMatrix.map(am => am.productName === p.name 
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
    { id: 6, component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Dostawcy</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Nazwa" className="p-3 border rounded-lg" value={manualSupplier.name} onChange={e => setManualSupplier({...manualSupplier, name: e.target.value})} />
          <input placeholder="Produkty" className="p-3 border rounded-lg" value={manualSupplier.products} onChange={e => setManualSupplier({...manualSupplier, products: e.target.value})} />
          <button onClick={handleAddSupplier} className="bg-slate-900 text-white p-3 rounded-lg">DODAJ</button>
        </div>
        {data.suppliers.map(s => <div key={s.id} className="p-3 bg-white border rounded-lg flex justify-between">{s.name} <span>{s.products}</span></div>)}
      </div>
    ), canNext: data.suppliers.length > 0 },
    { id: 7, component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Szczegóły GHP (Mycie i Dezynfekcja)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Sprzęt" className="p-3 border rounded-lg" value={manualGHP.equipmentName} onChange={e => setManualGHP({...manualGHP, equipmentName: e.target.value})} />
          <input placeholder="Częstotliwość" className="p-3 border rounded-lg" value={manualGHP.frequency} onChange={e => setManualGHP({...manualGHP, frequency: e.target.value})} />
          <input placeholder="Środek" className="p-3 border rounded-lg" value={manualGHP.cleaningAgent} onChange={e => setManualGHP({...manualGHP, cleaningAgent: e.target.value})} />
        </div>
        <button onClick={handleAddGHP} className="w-full bg-slate-900 text-white p-3 rounded-lg">DODAJ INSTRUKCJĘ</button>
        {data.ghpDetails.map((g, i) => <div key={i} className="p-3 bg-white border rounded-lg flex justify-between">{g.equipmentName} | {g.frequency}</div>)}
      </div>
    ), canNext: true },
    { id: 8, component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Analiza Zagrożeń</h2>
        <button onClick={handleSuggestHazards} disabled={isSuggestingHazards} className="bg-slate-900 text-white px-6 py-2 rounded-xl">SUGESTIE AI</button>
        {data.productHazards.map(h => (
          <div key={h.productName} className="p-4 border rounded-xl bg-white space-y-2">
            <h4 className="font-bold">{h.productName}</h4>
            <div className="grid grid-cols-3 gap-2">
              <textarea placeholder="B" className="text-xs p-2 border" value={h.biological} onChange={e => setData(prev => ({...prev, productHazards: prev.productHazards.map(x => x.productName === h.productName ? {...x, biological: e.target.value} : x)}))} />
              <textarea placeholder="C" className="text-xs p-2 border" value={h.chemical} onChange={e => setData(prev => ({...prev, productHazards: prev.productHazards.map(x => x.productName === h.productName ? {...x, chemical: e.target.value} : x)}))} />
              <textarea placeholder="F" className="text-xs p-2 border" value={h.physical} onChange={e => setData(prev => ({...prev, productHazards: prev.productHazards.map(x => x.productName === h.productName ? {...x, physical: e.target.value} : x)}))} />
            </div>
          </div>
        ))}
      </div>
    ), canNext: true },
    { id: 9, component: () => (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Warunki Pracy</h2>
        <input placeholder="Temperatura" className="w-full p-4 border rounded-xl" value={data.workingConditions.temperature} onChange={e => setData(prev => ({...prev, workingConditions: {...prev.workingConditions, temperature: e.target.value}}))} />
        <input placeholder="Wilgotność" className="w-full p-4 border rounded-xl" value={data.workingConditions.humidity} onChange={e => setData(prev => ({...prev, workingConditions: {...prev.workingConditions, humidity: e.target.value}}))} />
        <input placeholder="Wentylacja" className="w-full p-4 border rounded-xl" value={data.workingConditions.ventilation} onChange={e => setData(prev => ({...prev, workingConditions: {...prev.workingConditions, ventilation: e.target.value}}))} />
      </div>
    ), canNext: true }
  ], [data, nipError, suggestedDishesList, isSuggestingDishes, manualEquipment, manualSupplier, manualGHP, allergenSearch, allergenTypeFilter]);

  const renderFinalResult = () => {
    if (!generatedResult) return (
      <div className="flex flex-col items-center justify-center py-32 space-y-6 animate-fade-in">
        <div className="relative w-32 h-32">
          <div className="absolute inset-0 border-8 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          <i className="fa-solid fa-robot absolute inset-0 flex items-center justify-center text-4xl text-blue-600"></i>
        </div>
        <div className="w-full max-w-md bg-slate-200 h-4 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${genProgress}%` }}></div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-800">{genProgress}%</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em]">{genStatus}</p>
        </div>
      </div>
    );
    
    return (
      <div className="max-w-5xl mx-auto pb-20">
        <div className="bg-slate-900 text-white p-8 rounded-3xl mb-10 flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl no-print border-b-8 border-blue-600">
          <h1 className="text-3xl font-black tracking-tighter uppercase">Raport Systemu Bezpieczeństwa</h1>
          <div className="flex gap-4">
            <button onClick={exportToPDF} disabled={isExporting} className="bg-rose-600 px-6 py-3 rounded-xl font-bold flex items-center">
              {isExporting ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-file-pdf mr-2"></i>} PDF
            </button>
            <button onClick={exportToDOCX} disabled={isExportingDoc} className="bg-blue-600 px-6 py-3 rounded-xl font-bold flex items-center">
              {isExportingDoc ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-file-word mr-2"></i>} WORD
            </button>
          </div>
        </div>

        <div ref={reportRef} className="bg-white p-16 border shadow-2xl space-y-20 text-slate-900 overflow-visible">
           <section className="text-center py-40 border-[20px] border-double border-slate-50 rounded-[60px] page-break">
              <h2 className="text-5xl font-black mb-4 uppercase tracking-tighter">System Bezpieczeństwa Żywności</h2>
              <h3 className="text-2xl font-bold text-blue-600 uppercase mb-12">{data.docType}</h3>
              <div className="max-w-lg mx-auto bg-slate-50 p-10 rounded-3xl text-left border space-y-4">
                <p><strong>Firma:</strong> {data.details.name}</p>
                <p><strong>NIP:</strong> {data.details.nip}</p>
                <p><strong>Data:</strong> {new Date().toLocaleDateString('pl-PL')}</p>
              </div>
           </section>

           <section className="page-break space-y-12">
              <h3 className="text-3xl font-black uppercase border-b-8 border-slate-900 pb-4">1. Statystyki CCP i Ryzyk</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="bg-slate-50 p-8 rounded-3xl border">
                  <h4 className="font-bold mb-6 text-center uppercase text-xs tracking-widest text-slate-400">Rozkład Zagrożeń (Produktów)</h4>
                  <svg viewBox="0 0 400 300" className="w-full">
                    <rect x="80" y={250 - (hazardStats.bio / hazardStats.total) * 200} width="60" height={(hazardStats.bio / hazardStats.total) * 200} fill="#3b82f6" />
                    <rect x="170" y={250 - (hazardStats.chem / hazardStats.total) * 200} width="60" height={(hazardStats.chem / hazardStats.total) * 200} fill="#10b981" />
                    <rect x="260" y={250 - (hazardStats.phys / hazardStats.total) * 200} width="60" height={(hazardStats.phys / hazardStats.total) * 200} fill="#ef4444" />
                    <text x="110" y="270" textAnchor="middle" fontSize="12">Bio</text><text x="200" y="270" textAnchor="middle" fontSize="12">Chem</text><text x="290" y="270" textAnchor="middle" fontSize="12">Fiz</text>
                  </svg>
                </div>
                <div className="bg-slate-50 p-8 rounded-3xl border">
                  <h4 className="font-bold mb-6 text-center uppercase text-xs tracking-widest text-slate-400">Typy Zagrożeń w CCP</h4>
                  <svg viewBox="0 0 400 300" className="w-full">
                    <rect x="80" y={250 - (ccpStats.bio / ccpStats.total) * 200} width="60" height={(ccpStats.bio / ccpStats.total) * 200} fill="#3b82f6" />
                    <rect x="170" y={250 - (ccpStats.chem / ccpStats.total) * 200} width="60" height={(ccpStats.chem / ccpStats.total) * 200} fill="#10b981" />
                    <rect x="260" y={250 - (ccpStats.phys / ccpStats.total) * 200} width="60" height={(ccpStats.phys / ccpStats.total) * 200} fill="#ef4444" />
                    <text x="110" y="270" textAnchor="middle" fontSize="12">Bio CCP</text><text x="200" y="270" textAnchor="middle" fontSize="12">Chem CCP</text><text x="290" y="270" textAnchor="middle" fontSize="12">Fiz CCP</text>
                  </svg>
                </div>
              </div>
           </section>

           <section className="page-break space-y-10">
              <div className="flex justify-between items-end border-b-8 border-slate-900 pb-4">
                <h3 className="text-3xl font-black uppercase">2. Procedury Operacyjne (SOP)</h3>
                <button onClick={handleSuggestSOPs} disabled={isSuggestingSOPs} className="no-print bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold">GENERUJ SUGESTIE AI</button>
              </div>
              <div className="space-y-6">
                {data.sopBlocks.map(sop => (
                  <div key={sop.id} className="p-8 border rounded-3xl bg-white shadow-sm">
                    <h4 className="font-black uppercase text-xl mb-4 text-blue-600">{sop.title}</h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{sop.content}</p>
                  </div>
                ))}
              </div>
           </section>

           <section className="page-break space-y-10">
              <h3 className="text-3xl font-black uppercase border-b-8 border-slate-900 pb-4">3. Wykaz Punktów Krytycznych (CCP)</h3>
              <div className="space-y-10">
                {generatedResult.ccps.map((c: any, i: number) => (
                  <div key={i} className="border-4 border-slate-900 rounded-3xl overflow-hidden shadow-xl bg-white">
                    <div className="bg-slate-900 text-white p-6 font-black uppercase flex justify-between">
                      <span>CCP {i+1}: {c.title}</span> <span className="text-[10px] bg-red-600 px-3 py-1 rounded-full">{c.hazardType}</span>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                      <div className="space-y-4">
                        <p><strong>Monitoring:</strong> {c.monitoring}</p>
                        <p><strong>Zagrożenie:</strong> {c.hazard}</p>
                      </div>
                      <div className="bg-red-50 p-6 rounded-2xl border-2 border-red-100">
                        <p className="font-black text-red-600 uppercase text-[10px] mb-2">Limity i Działania:</p>
                        <p><strong>Limity:</strong> {c.criticalLimits}</p>
                        <p><strong>Naprawa:</strong> {c.correctiveActions}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
           </section>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      <nav className="bg-white border-b px-8 py-5 flex justify-between items-center sticky top-0 z-50 shadow-sm no-print">
        <div className="flex items-center space-x-3">
           <div className="bg-blue-600 w-10 h-10 flex items-center justify-center rounded-xl shadow-lg shadow-blue-200">
              <i className="fa-solid fa-file-shield text-white text-lg"></i>
           </div>
           <span className="text-2xl font-black text-slate-900 tracking-tighter">HACCP<span className="text-blue-600">.pro</span></span>
        </div>
      </nav>
      <main className="flex-1 container mx-auto px-4 py-16">
        {step < 10 ? (
          <div className="max-w-4xl mx-auto no-print">
            <StepWizard currentStep={step} totalSteps={9} onNext={handleNext} onBack={() => setStep(step-1)} canNext={true} isLoading={isGenerating}>
              {currentStepConfig[step-1]?.component()}
            </StepWizard>
          </div>
        ) : renderFinalResult()}
      </main>
    </div>
  );
}
