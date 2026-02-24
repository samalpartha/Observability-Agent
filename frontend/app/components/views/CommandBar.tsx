
import React, { useRef } from "react";
import { MicIcon, SparklesIcon, ArrowBackIcon } from "../Icons";
import { useCopilotStore } from "../../store/copilotStore";

interface CommandBarProps {
    onRun: () => void;
    loading: boolean;
    isListening: boolean;
    toggleMic: () => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onRun, loading, isListening, toggleMic }) => {
    const { question, setQuestion, setShowSaveModal } = useCopilotStore();
    const inputRef = useRef<HTMLInputElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onRun();
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto mb-8 relative z-20">
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex items-center p-2">
                    <div className="pl-4 pr-3 text-slate-400">
                        <SparklesIcon className="w-6 h-6 text-indigo-400" />
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        className="w-full bg-transparent border-none text-white text-lg placeholder-slate-500 focus:ring-0 px-2 py-3"
                        placeholder="Ask Copilot a question (e.g. 'Why is checkout slow?')"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        autoFocus
                    />
                    <div className="flex items-center space-x-2 pr-2">
                        <button
                            onClick={toggleMic}
                            className={`p-2 rounded-xl transition-colors ${isListening ? "bg-red-500/20 text-red-400 animate-pulse" : "hover:bg-slate-800 text-slate-400"}`}
                            title="Voice input"
                        >
                            <MicIcon className="w-5 h-5" />
                        </button>
                        {question.trim() && (
                            <button
                                onClick={() => setShowSaveModal(true)}
                                className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors"
                                title="Save this prompt"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                            </button>
                        )}
                        <button
                            onClick={onRun}
                            disabled={loading || !question.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-lg shadow-indigo-500/20"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <ArrowBackIcon className="w-5 h-5 transform rotate-180" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
            <div className="absolute top-full left-0 w-full flex justify-between px-4 py-2 text-xs text-slate-500">
                <span>Press <strong>Enter</strong> to run</span>
                <span><strong>⌘K</strong> to focus</span>
            </div>
        </div>
    );
};
