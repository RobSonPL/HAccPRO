
import React from 'react';

interface StepWizardProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  canNext: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

export const StepWizard: React.FC<StepWizardProps> = ({ 
  currentStep, 
  totalSteps, 
  onNext, 
  onBack, 
  canNext, 
  isLoading,
  children 
}) => {
  return (
    <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-200">
      <div className="bg-slate-50 border-b border-slate-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Krok {currentStep} z {totalSteps}</span>
          <div className="w-48 h-2 bg-slate-200 rounded-full">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-300" 
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
      
      <div className="p-8 min-h-[400px]">
        {children}
      </div>

      <div className="bg-slate-50 border-t border-slate-200 p-6 flex justify-between items-center">
        <button
          onClick={onBack}
          disabled={currentStep === 1 || isLoading}
          className="px-6 py-2.5 rounded-lg font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-colors"
        >
          <i className="fa-solid fa-arrow-left mr-2"></i> Wstecz
        </button>
        
        <button
          onClick={onNext}
          disabled={!canNext || isLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-8 py-2.5 rounded-lg font-semibold shadow-lg shadow-blue-200 transition-all flex items-center"
        >
          {isLoading ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Generowanie...
            </>
          ) : (
            <>
              {currentStep === totalSteps ? 'Zakończ i Generuj' : 'Dalej'} <i className="fa-solid fa-arrow-right ml-2"></i>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
