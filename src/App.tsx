/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Droplets, 
  Activity, 
  Home, 
  Waves, 
  Zap, 
  AlertTriangle, 
  Bell, 
  TrendingUp, 
  Settings, 
  RefreshCw,
  Play,
  Square,
  ArrowRight,
  Cpu,
  Smartphone,
  Info
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants ---
const LPCD_LIMIT = 55; // Litres per household
const MAIN_TANK_CAPACITY = 1000; // Litres
const HOUSE_TANK_CAPACITY = 50; // Litres (Small buffer tank for each house)
const FLOW_RATE_PER_TICK = 0.5; // Litres per second when valve is open
const USAGE_RATE_NORMAL = 0.1; // Litres per second when household is "using" water
const LEAK_RATE = 0.8; // Litres per second when leak is simulated

// --- Types ---
type ValveStatus = 'OPEN' | 'CLOSED';
type PumpStatus = 'ON' | 'OFF';

interface Household {
  id: string;
  name: string;
  waterUsedToday: number;
  tankLevel: number; // 0 to 100
  valveStatus: ValveStatus;
  isUsingWater: boolean;
  isLeaking: boolean; // Overflow
  isBlocked: boolean; // Valve Jam
  flowRate: number;
  pressure: number;
  pulses: number;
}

interface Alert {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: Date;
}

// --- Components ---

const Tank = ({ level, label, color = "bg-blue-500", isBlocked = false }: { level: number, label: string, color?: string, isBlocked?: boolean }) => {
  const isOverflowing = level > 100;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative w-24 h-40 bg-slate-200 rounded-lg border-2 ${isOverflowing ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : isBlocked ? 'border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-slate-300'} overflow-hidden shadow-inner transition-all duration-300`}>
        <motion.div 
          initial={{ height: 0 }}
          animate={{ height: `${Math.min(100, level)}%` }}
          transition={{ type: "spring", stiffness: 50, damping: 20 }}
          className={`absolute bottom-0 w-full ${level < 20 ? 'bg-red-500' : level < 50 ? 'bg-amber-500' : color} transition-colors duration-500`}
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-white/20 animate-pulse" />
        </motion.div>
        
        {/* Overflow Indicator */}
        {isOverflowing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="absolute top-0 left-0 w-full h-full bg-red-500/20 flex flex-col items-center justify-start pt-2"
          >
            <AlertTriangle size={24} className="text-red-600 mb-1" />
            <span className="text-[10px] font-bold text-red-700 uppercase">Overflow</span>
          </motion.div>
        )}

        {/* Blockage Indicator */}
        {isBlocked && (
          <div className="absolute inset-0 bg-amber-500/10 flex flex-col items-center justify-center z-20">
            <Settings size={20} className="text-amber-600 animate-spin-slow" />
            <span className="text-[8px] font-black text-amber-700 uppercase mt-1">Blocked</span>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-slate-700 text-sm z-10">
          {Math.round(level)}%
        </div>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
};

const StatusBadge = ({ status, activeColor = "bg-emerald-500" }: { status: string, activeColor?: string }) => (
  <div className="flex items-center gap-2">
    <div className={`w-2 h-2 rounded-full ${status === 'OPEN' || status === 'ON' ? activeColor : 'bg-slate-300'} animate-pulse`} />
    <span className="text-xs font-mono font-bold">{status}</span>
  </div>
);

export default function App() {
  // --- State ---
  const [mainTankLevel, setMainTankLevel] = useState(80);
  const [pumpStatus, setPumpStatus] = useState<PumpStatus>('OFF');
  const [households, setHouseholds] = useState<Household[]>([
    { id: 'A', name: 'House A', waterUsedToday: 0, tankLevel: 60, valveStatus: 'CLOSED', isUsingWater: false, isLeaking: false, isBlocked: false, flowRate: 0, pressure: 100, pulses: 0 },
    { id: 'B', name: 'House B', waterUsedToday: 0, tankLevel: 40, valveStatus: 'CLOSED', isUsingWater: false, isLeaking: false, isBlocked: false, flowRate: 0, pressure: 100, pulses: 0 },
    { id: 'C', name: 'House C', waterUsedToday: 0, tankLevel: 90, valveStatus: 'CLOSED', isUsingWater: false, isLeaking: false, isBlocked: false, flowRate: 0, pressure: 100, pulses: 0 },
  ]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<{ time: string, flow: number, pressure: number }[]>([]);
  const [isManualPump, setIsManualPump] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);

  // --- Refs for simulation ---
  const tickRef = useRef<number>(0);

  // --- Helper: Add Alert ---
  const addAlert = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setAlerts(prev => [{ id, message, type, timestamp: new Date() }, ...prev].slice(0, 5));
  };

  // --- Simulation Loop ---
  useEffect(() => {
    const interval = setInterval(() => {
      tickRef.current += 1;

      setHouseholds(prev => prev.map(house => {
        let newLevel = house.tankLevel;
        let newUsed = house.waterUsedToday;
        let newValve = house.valveStatus;
        let newFlow = 0;
        let newPressure = 100;
        let newPulses = house.pulses;

        // 1. Water Usage Logic (Adjusted by simSpeed)
        if (house.isUsingWater) {
          const usage = USAGE_RATE_NORMAL * simSpeed;
          newLevel = Math.max(0, newLevel - (usage / HOUSE_TANK_CAPACITY) * 100);
          // Quota is now calculated based on supply, not consumption
        }

        // 2. Overflow Logic (User's "Simulate Overflow")
        if (house.isLeaking) {
          newValve = 'OPEN';
          newPressure = 100;
          
          // Tank receives water and exceeds 100% up to 105%
          if (newLevel < 105) {
            newLevel = Math.min(105, newLevel + ((FLOW_RATE_PER_TICK * simSpeed) / HOUSE_TANK_CAPACITY) * 100);
          }
          
          if (newLevel >= 100 && tickRef.current % 5 === 0) {
            addAlert(`🚨 OVERFLOW ALERT: ${house.name} tank is overflowing!`, 'error');
          }
        }

        // 3. Valve Jam / Blockage Logic (User's "Simulate Valve Jam")
        if (house.isBlocked) {
          newValve = 'OPEN'; // Attempting to fill
          newFlow = 0; // Blocked
          newPressure = 150; // High pressure in inlet pipe
          
          if (tickRef.current % 8 === 0) {
            addAlert(`⚠️ VALVE JAM: Blockage detected at ${house.name} inlet. High pressure!`, 'error');
          }
        }

        // 4. Automation Logic: Filling House Tank
        // Normal operation: If level < 50% and main tank has water and LPCD not reached
        if (!house.isLeaking && !house.isBlocked) {
          if (newLevel < 50 && mainTankLevel > 0 && newUsed < LPCD_LIMIT) {
            newValve = 'OPEN';
          }

          // Stop filling if full or LPCD reached
          if (newLevel >= 100 || newUsed >= LPCD_LIMIT) {
            newValve = 'CLOSED';
            if (newUsed >= LPCD_LIMIT && house.valveStatus === 'OPEN') {
              addAlert(`✅ LPCD Limit (55L) reached for ${house.name}. Valve closed.`, 'info');
            }
          }
        }

        // 5. Flow Calculation (Normal & Overflow)
        if (newValve === 'OPEN' && mainTankLevel > 0 && !house.isBlocked) {
          newFlow = FLOW_RATE_PER_TICK * simSpeed;
          // Quota increases based on water supplied from main tank
          newUsed = Math.min(LPCD_LIMIT + 5, newUsed + newFlow); 

          // Normal filling caps at 100. Overflow handled above.
          if (!house.isLeaking) {
            newLevel = Math.min(100, newLevel + (newFlow / HOUSE_TANK_CAPACITY) * 100);
          }
          newPulses += Math.floor(Math.random() * 10 * simSpeed) + 5;
        }

        return { ...house, tankLevel: newLevel, waterUsedToday: newUsed, valveStatus: newValve, flowRate: newFlow, pressure: newPressure, pulses: newPulses };
      }));

      // 5. Main Tank & Pump Logic
      setMainTankLevel(prev => {
        let current = prev;
        
        // Decrease main tank as houses fill
        const totalOutflow = households.reduce((sum, h) => sum + (h.valveStatus === 'OPEN' ? FLOW_RATE_PER_TICK * simSpeed : 0), 0);
        current = Math.max(0, current - (totalOutflow / MAIN_TANK_CAPACITY) * 100);

        // Pump Logic
        if (!isManualPump) {
          if (current < 50) setPumpStatus('ON');
          if (current >= 100) setPumpStatus('OFF');
        }

        if (pumpStatus === 'ON') {
          current = Math.min(100, current + (1 * simSpeed)); // Fills faster with simSpeed
        }

        return current;
      });

      // 6. Update History for Graphs
      setHistory(prev => {
        const totalFlow = households.reduce((sum, h) => sum + h.flowRate, 0);
        const avgPressure = households.reduce((sum, h) => sum + h.pressure, 0) / 3;
        const newEntry = {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          flow: totalFlow,
          pressure: avgPressure
        };
        return [...prev, newEntry].slice(-20);
      });

    }, 1000);

    return () => clearInterval(interval);
  }, [mainTankLevel, pumpStatus, households, isManualPump, simSpeed]);

  // --- Handlers ---
  const toggleUsage = (id: string) => {
    setHouseholds(prev => prev.map(h => h.id === id ? { ...h, isUsingWater: !h.isUsingWater } : h));
  };

  const toggleLeak = (id: string) => {
    setHouseholds(prev => prev.map(h => {
      if (h.id === id) {
        const nextLeaking = !h.isLeaking;
        // If fixing overflow, return to 100%
        return { ...h, isLeaking: nextLeaking, tankLevel: nextLeaking ? h.tankLevel : 100 };
      }
      return h;
    }));
  };

  const toggleBlock = (id: string) => {
    setHouseholds(prev => prev.map(h => h.id === id ? { ...h, isBlocked: !h.isBlocked } : h));
  };

  const resetUsage = () => {
    setHouseholds(prev => prev.map(h => ({ ...h, waterUsedToday: 0, isLeaking: false, isBlocked: false, isUsingWater: false })));
    addAlert("System usage reset for a new day.", "info");
  };

  const togglePumpManual = () => {
    setIsManualPump(true);
    setPumpStatus(prev => prev === 'ON' ? 'OFF' : 'ON');
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] text-slate-900 font-sans p-4 md:p-8 relative overflow-x-hidden">
      {/* Themed Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-400/5 blur-[150px]" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-emerald-400/5 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
      </div>

      <div className="relative z-10">
        {/* Header */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <Droplets size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">SmartAqua <span className="text-blue-600">Rural</span></h1>
          </div>
          <p className="text-slate-500 text-sm font-medium">IoT-Enabled LPCD Water Distribution Dashboard</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">Sim Speed</span>
              <div className="flex items-center gap-1">
                {[1, 2, 5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setSimSpeed(speed)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${simSpeed === speed ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {speed}X
                  </button>
                ))}
              </div>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">System Status</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold text-slate-700">ONLINE</span>
              </div>
            </div>
          </div>
          <button 
            onClick={resetUsage}
            className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors text-slate-600"
            title="Reset Daily Usage"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Main Infrastructure */}
        <div className="lg:col-span-4 space-y-6">
          {/* Main Reservoir */}
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold flex items-center gap-2 text-slate-700">
                <Waves className="text-blue-500" size={20} />
                Main Reservoir
              </h2>
              <StatusBadge status={pumpStatus} activeColor="bg-blue-500" />
            </div>
            
            <div className="flex justify-around items-end py-4">
              <Tank level={mainTankLevel} label="Main Tank" color="bg-blue-600" />
              <div className="flex flex-col gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Pump Control</span>
                  <div className="flex items-center gap-3">
                    <motion.div 
                      animate={pumpStatus === 'ON' ? { rotate: 360 } : {}}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      className={`p-2 rounded-full ${pumpStatus === 'ON' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}
                    >
                      <Zap size={20} />
                    </motion.div>
                    <button 
                      onClick={togglePumpManual}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${pumpStatus === 'ON' ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-blue-600 text-white shadow-lg shadow-blue-200'}`}
                    >
                      {pumpStatus === 'ON' ? 'STOP PUMP' : 'START PUMP'}
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Capacity</span>
                  <span className="text-xl font-mono font-bold text-slate-700">{Math.round((mainTankLevel / 100) * MAIN_TANK_CAPACITY)}L</span>
                  <span className="text-xs text-slate-400 ml-1">/ {MAIN_TANK_CAPACITY}L</span>
                </div>
              </div>
            </div>
          </section>

          {/* Architecture Visualization */}
          <section className="bg-slate-900 rounded-3xl p-6 shadow-xl text-white overflow-hidden relative border border-slate-800">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Cpu size={80} />
            </div>
            <h2 className="font-bold flex items-center gap-2 mb-6 text-slate-300">
              <Info size={18} />
              System Architecture
            </h2>
            <div className="flex flex-col gap-6 relative z-10">
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-xl border transition-all duration-500 ${pumpStatus === 'ON' ? 'border-blue-400 bg-blue-400/20 text-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.3)]' : 'border-slate-700 bg-slate-800 text-slate-500'} flex flex-col items-center gap-1 w-24`}>
                  <Zap size={20} className={pumpStatus === 'ON' ? 'animate-pulse' : ''} />
                  <span className="text-[10px] font-bold uppercase">Pump</span>
                </div>
                <ArrowRight className={`${pumpStatus === 'ON' || households.some(h => h.valveStatus === 'OPEN') ? 'text-blue-500' : 'text-slate-700'} transition-colors duration-500`} size={16} />
                <div className="p-3 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-500 flex flex-col items-center gap-1 w-24 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                  <Waves size={20} className="animate-pulse" />
                  <span className="text-[10px] font-bold uppercase">NodeMCU</span>
                </div>
                <ArrowRight className={`${households.some(h => h.valveStatus === 'OPEN') ? 'text-emerald-500' : 'text-slate-700'} transition-colors duration-500`} size={16} />
                <div className={`p-3 rounded-xl border transition-all duration-500 ${households.some(h => h.valveStatus === 'OPEN') ? 'border-emerald-400 bg-emerald-400/20 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'border-slate-700 bg-slate-800 text-slate-500'} flex flex-col items-center gap-1 w-24`}>
                  <Activity size={20} className={households.some(h => h.valveStatus === 'OPEN') ? 'animate-bounce' : ''} />
                  <span className="text-[10px] font-bold uppercase">Valves</span>
                </div>
              </div>
              <div className="h-px bg-slate-800 w-full" />
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block mb-2">Sensors</span>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all duration-300 ${households.some(h => h.flowRate > 0) ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-700 text-slate-400'}`}>FLOW</span>
                    <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[9px] font-bold shadow-sm">ULTRASONIC</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all duration-300 ${households.some(h => h.isBlocked || h.isLeaking) ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}>PRESSURE</span>
                  </div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block mb-2">Communication</span>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all duration-300 ${alerts.length > 0 && (Date.now() - alerts[0].timestamp.getTime() < 5000) ? 'bg-amber-500 text-white animate-bounce' : 'bg-slate-700 text-slate-400'}`}>GSM/SMS</span>
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[9px] font-bold animate-pulse">MQTT</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* AI Prediction Panel */}
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="font-bold flex items-center gap-2 mb-4 text-slate-700">
              <TrendingUp className="text-indigo-500" size={20} />
              AI Insights (Mock)
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-indigo-400 block">Tomorrow's Demand</span>
                  <span className="text-lg font-bold text-indigo-900">142.5 Litres</span>
                </div>
                <div className="text-indigo-600">
                  <TrendingUp size={24} />
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Suggested Schedule</span>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span>Pump Run: 05:00 AM - 06:30 AM</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span>Optimal Pressure: 85-95%</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Households & Analytics */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Household Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {households.map((house) => (
              <motion.div 
                key={house.id}
                layout
                className={`bg-white rounded-3xl p-5 shadow-sm border transition-all ${house.isLeaking ? 'border-red-200 bg-red-50/30' : house.isBlocked ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${house.isLeaking ? 'bg-red-100 text-red-600' : house.isBlocked ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                      <Home size={18} />
                    </div>
                    <h3 className="font-bold text-slate-800">{house.name}</h3>
                  </div>
                  <StatusBadge status={house.isBlocked ? 'BLOCKED' : house.valveStatus} activeColor={house.isBlocked ? 'bg-red-600' : 'bg-emerald-500'} />
                </div>

                <div className="flex justify-center mb-6">
                  <Tank level={house.tankLevel} label="House Tank" isBlocked={house.isBlocked} />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Quota Supplied</span>
                    <span className={`text-sm font-mono font-bold ${house.waterUsedToday > LPCD_LIMIT * 0.8 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {house.waterUsedToday.toFixed(1)}L / {LPCD_LIMIT}L
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(house.waterUsedToday / LPCD_LIMIT) * 100}%` }}
                      className={`h-full ${house.waterUsedToday >= LPCD_LIMIT ? 'bg-red-500' : 'bg-blue-500'}`}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Flow Rate</span>
                      <span className="text-xs font-mono font-bold text-slate-700">{house.flowRate.toFixed(2)} L/s</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Pressure</span>
                      <span className={`text-xs font-mono font-bold ${house.pressure < 50 ? 'text-red-500' : 'text-slate-700'}`}>{house.pressure}%</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <button 
                      onClick={() => toggleUsage(house.id)}
                      className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${house.isUsingWater ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {house.isUsingWater ? <Square size={14} /> : <Play size={14} />}
                      {house.isUsingWater ? 'STOP USAGE' : 'SIMULATE USAGE'}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => toggleLeak(house.id)}
                        className={`py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${house.isLeaking ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100'}`}
                      >
                        <AlertTriangle size={12} />
                        {house.isLeaking ? 'FIX LEAK' : 'SIM LEAK'}
                      </button>
                      <button 
                        onClick={() => toggleBlock(house.id)}
                        className={`py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${house.isBlocked ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100'}`}
                      >
                        <Settings size={12} />
                        {house.isBlocked ? 'FIX JAM' : 'SIM JAM'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Real-time Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold flex items-center gap-2 text-slate-700">
                  <Activity className="text-emerald-500" size={20} />
                  System Flow Rate
                </h2>
                <span className="text-[10px] font-mono font-bold text-slate-400">LITRES / SECOND</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={[0, 2]} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="flow" stroke="#10b981" fillOpacity={1} fill="url(#colorFlow)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold flex items-center gap-2 text-slate-700">
                  <TrendingUp className="text-blue-500" size={20} />
                  Network Pressure
                </h2>
                <span className="text-[10px] font-mono font-bold text-slate-400">PERCENTAGE %</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={[0, 110]} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line type="monotone" dataKey="pressure" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* GSM Alerts & Notifications */}
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold flex items-center gap-2 text-slate-700">
                <Bell className="text-amber-500" size={20} />
                GSM Alerts (SMS Simulation)
              </h2>
              <Smartphone size={18} className="text-slate-300" />
            </div>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {alerts.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm italic">
                    No active alerts. System running smoothly.
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <motion.div 
                      key={alert.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`p-3 rounded-2xl border flex items-start gap-3 ${
                        alert.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' :
                        alert.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        'bg-blue-50 border-blue-100 text-blue-700'
                      }`}
                    >
                      <div className="mt-0.5">
                        {alert.type === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold leading-tight">{alert.message}</p>
                        <span className="text-[10px] opacity-60 font-mono mt-1 block">
                          {alert.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400">
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1"><Settings size={14} /> Config: LPCD 55L</span>
          <span className="flex items-center gap-1"><Activity size={14} /> Sensors: Active</span>
        </div>
        <p className="text-xs font-medium">© 2026 Smart Rural Water Distribution System Simulation</p>
      </footer>
    </div>
    </div>
  );
}
