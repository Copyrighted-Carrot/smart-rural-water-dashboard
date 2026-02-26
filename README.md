# 💧 Smart Rural Water Distribution System Dashboard

A high-fidelity **IoT simulation dashboard** designed to demonstrate efficient water resource management in rural areas.  
This project models a **Smart Village water network** where government-controlled distribution ensures fairness, automation, and failure detection — all running entirely in the browser.

---

## 🎯 Project Objective

The system simulates a rural water distribution network that enforces a **55 LPCD (Litres Per Capita per Day)** quota for households.

### Goals
- Ensure **equitable water distribution**
- Prevent wastage due to infrastructure failures
- Detect issues like **tank overflows**, **valve jams**, and **blockages**
- Demonstrate practical IoT automation concepts visually

---

## 🧩 Core Functional Modules

### 🚰 Main Reservoir & Pump Station
- **Capacity:** 1000L central storage tank
- **Automation Logic:**
  - Pump turns **ON** below 50% level
  - Pump turns **OFF** at 100%
- **Manual Override:** Supervisor can start/stop pump anytime

---

### 🏠 Household Distribution (Houses A, B, C)

#### Individual Buffer Tanks
- Each house contains a **50L local buffer tank**

#### Smart Refilling
- Household valve opens automatically below **50% tank level**

#### Quota Enforcement
- Government valve closes once **55L daily quota** is reached  
- Works even if the tank isn’t fully filled

---

### ⚠️ Critical Failure Simulations

#### 🔴 Overflow / Leak Simulation
- Tank level exceeds 100% (up to 105%)
- Red glowing overflow state
- Triggers **critical GSM alert**

#### 🟠 Valve Jam / Blockage Simulation
- Valve appears OPEN but:
  - Flow Rate = 0
  - Inlet Pressure spikes to 150%
- Generates **Valve Jam alert**

---

## 📊 Smart Monitoring Features

### 📈 Real-Time Analytics
- **System Flow Rate:** Live area chart (Litres/Second)
- **Network Pressure:** Line chart for pipe stability monitoring

### 📱 GSM Alert System (SMS Simulation)
Notification panel logs:

| Level | Example Events |
|------|----------------|
| ℹ️ Info | Quota reached, daily reset |
| ⚠️ Warning | Low pressure, high demand |
| ❌ Error | Overflow, Valve Jam, Blockage |

### 🧠 Dynamic System Architecture
Live visualization shows interaction between:
- Sensors (Flow, Ultrasonic, Pressure)
- NodeMCU (Central Processing Unit)
- Actuators (Pump & Solenoid Valves)

Icons animate based on system state:
- Pulse
- Bounce
- Glow

---

## 🎮 Interactive Demo Tools

- ⏩ **Simulation Speed:** 1X / 2X / 5X time acceleration
- 💦 **Simulate Usage:** Trigger household water consumption
- 🔄 **Daily Reset:** Reset quotas instantly for a new simulation day

---

## 🛠️ Technical Stack

| Layer | Technology |
|------|------------|
| Frontend | React 18 (Functional Components & Hooks) |
| Styling | Tailwind CSS – Rural Tech theme |
| Animations | Framer Motion |
| Charts | Recharts |
| Icons | Lucide React |

---

## 🥇 Why This is “Mentor Demo Gold”

✅ **Logic Precision**  
Separates water *usage* vs *supply* — essential for LPCD-based governance.

✅ **Strong Visual Feedback**  
Every system state has a matching animation or color change.

✅ **Self-Contained Simulation**  
- No backend
- No database
- Runs fully in the browser  
Perfect for reliable live demonstrations.

---

## 🌍 Real-World Impact

This dashboard demonstrates how IoT systems can address:
- Rural water scarcity
- Infrastructure monitoring
- Automated governance
- Sustainable resource management