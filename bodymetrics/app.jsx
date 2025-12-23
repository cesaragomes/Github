import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend
} from 'recharts';
import { 
  Camera, Ruler, Calendar, TrendingUp, Save, Trash2, 
  ChevronRight, PlusCircle, Activity, User, Info, LogOut,
  Lock, Calculator, Scale, X, Maximize2
} from 'lucide-react';

// --- Infraestrutura Firebase ---
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';

// --- Configuração do Firebase (Produção) ---
const firebaseConfig = {
  apiKey: "INSIRA_AQUI_A_SUA_API_KEY",
  authDomain: "SEU-PROJECTO.firebaseapp.com",
  projectId: "SEU-PROJECTO-ID",
  storageBucket: "SEU-PROJECTO.firebasestorage.app",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SUA_APP_ID",
  measurementId: "SEU_MEASUREMENT_ID" // Opcional
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "bodymetrics-web";

// --- Utilitários Matemáticos (Fisiologia) ---

/**
 * Calcula a Idade Cronológica
 */
const calculateAge = (birthDateString) => {
  if (!birthDateString) return 0;
  const today = new Date();
  const birthDate = new Date(birthDateString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

/**
 * Estimativa de BF% (Body Fat - Percentual de Gordura Corporal)
 */
const calculateBF = (method, gender, age, data) => {
  const height = parseFloat(data.height);
  const waist = parseFloat(data.waist);
  const neck = parseFloat(data.neck);
  const hips = parseFloat(data.hips);
  const glutes = parseFloat(data.glutes);
  const ageVal = parseFloat(age);

  if (!ageVal || !gender) return null;

  if (method === 'navy') {
    if (!height || !waist || !neck) return null;
    if (gender === 'male') {
      if (waist - neck <= 0) return null;
      return (86.010 * Math.log10(waist - neck)) - (70.041 * Math.log10(height)) + 36.76;
    } else {
      if (!glutes || (waist + glutes - neck) <= 0) return null;
      return (163.205 * Math.log10(waist + glutes - neck)) - (97.684 * Math.log10(height)) - 78.387;
    }
  }

  const getSum = (fields) => fields.reduce((acc, field) => acc + (parseFloat(data[field]) || 0), 0);
  let bodyDensity = 0;

  if (method === '3site') {
    if (gender === 'male') {
      const sum = getSum(['skinfoldChest', 'skinfoldAbdomen', 'skinfoldThigh']);
      if (sum === 0) return null;
      bodyDensity = 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum) - (0.0002574 * ageVal);
    } else {
      const sum = getSum(['skinfoldTriceps', 'skinfoldSuprailiac', 'skinfoldThigh']);
      if (sum === 0) return null;
      bodyDensity = 1.0994921 - (0.0009929 * sum) + (0.0000023 * sum * sum) - (0.0001392 * ageVal);
    }
  }

  if (method === '7site') {
    const sum = getSum(['skinfoldChest', 'skinfoldAxilla', 'skinfoldTriceps', 'skinfoldSubscapular', 'skinfoldAbdomen', 'skinfoldSuprailiac', 'skinfoldThigh']);
    if (sum === 0) return null;
    if (gender === 'male') {
      bodyDensity = 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum) - (0.00028826 * ageVal);
    } else {
      bodyDensity = 1.097 - (0.00046971 * sum) + (0.00000056 * sum * sum) - (0.00012828 * ageVal);
    }
  }

  if (bodyDensity > 0) return (495 / bodyDensity) - 450;
  return null;
};

const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    };
  });
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
};

// --- Componentes de UI ---

const LoginScreen = ({ onLogin }) => (
  <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-center font-sans">
    <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-sm">
      <div className="bg-emerald-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500">
        <Activity size={32} />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">BodyMetrics</h1>
      <p className="text-slate-400 mb-8 text-sm">Seu diário de evolução muscular e composição corporal.</p>
      <button onClick={onLogin} className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-3">
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Entrar com Google
      </button>
    </div>
  </div>
);

const MetricCard = ({ title, value, unit, icon: Icon, color = "emerald" }) => (
  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm flex items-center justify-between">
    <div>
      <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">{title}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${color === 'blue' ? 'text-blue-400' : 'text-white'}`}>{value || '-'}</span>
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
    </div>
    <div className={`p-2.5 rounded-full ${color === 'blue' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
      <Icon size={20} />
    </div>
  </div>
);

const PhotoUploader = ({ label, onImageSelect, currentImage }) => {
  const fileInputRef = useRef(null);
  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const compressed = await compressImage(e.target.files[0]);
      onImageSelect(compressed);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter text-center">{label}</span>
      <div 
        onClick={() => fileInputRef.current.click()}
        className={`relative h-24 w-full rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors overflow-hidden ${currentImage ? 'border-emerald-500/50 bg-slate-900' : 'border-slate-600 hover:border-slate-400 bg-slate-800'}`}
      >
        {currentImage ? (
          <img src={currentImage} alt="Preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center text-slate-500">
            <Camera size={20} className="mb-1" />
            <span className="text-[10px]">Anexar</span>
          </div>
        )}
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange}/>
      </div>
    </div>
  );
};

const InputGroup = ({ title, children }) => (
  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-4 shadow-sm">
    <h3 className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-3 border-b border-slate-700 pb-2">{title}</h3>
    <div className="grid grid-cols-2 gap-4">{children}</div>
  </div>
);

/**
 * Componente de Entrada Numérica de Alta Performance (Correção Desktop)
 * Esta versão utiliza um container flexbox para isolar fisicamente o campo de texto do sufixo,
 * eliminando a sobreposição visual com os botões nativos do navegador em desktops.
 */
const NumberInput = ({ label, value, onChange, placeholder = "0", suffix = "cm", type="number" }) => (
  <div className="flex flex-col gap-1 w-full">
    <label className="text-[10px] text-slate-500 font-bold uppercase truncate">{label}</label>
    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500 transition-all px-3 overflow-hidden group">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`
          flex-1 bg-transparent text-white py-2 focus:outline-none placeholder-slate-700 text-sm w-full m-0
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
          [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0
        `}
      />
      <span className="text-slate-600 text-[10px] font-black pointer-events-none select-none uppercase tracking-tighter ml-2 shrink-0">
        {suffix}
      </span>
    </div>
  </div>
);

// --- Componente Principal da Aplicação ---

export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chartView, setChartView] = useState('summary'); 
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    birthDate: '', gender: 'male', height: '', weight: '', 
    neck: '', chest: '', waist: '', hips: '', glutes: '',
    armRight: '', armLeft: '', forearmRight: '', forearmLeft: '',
    thighRight: '', thighLeft: '', calfRight: '', calfLeft: '',
    skinfoldChest: '', skinfoldAbdomen: '', skinfoldThigh: '', skinfoldTriceps: '',
    skinfoldSuprailiac: '', skinfoldAxilla: '', skinfoldSubscapular: '',
    bfMethod: 'none',
    photoFront: null, photoBack: null, photoSide: null, notes: ''
  });

  const [liveBF, setLiveBF] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setEntries([]); return; }

    const fetchProfile = async () => {
      try {
        const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const profile = userDocSnap.data();
          setUserProfile(profile);
          setFormData(prev => ({
            ...prev,
            height: profile.height || '',
            gender: profile.gender || 'male',
            birthDate: profile.birthDate || ''
          }));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchProfile();

    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'measurements'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (showForm && userProfile) {
      setFormData(prev => ({
        ...prev,
        height: prev.height || userProfile.height || '',
        gender: prev.gender || userProfile.gender || 'male',
        birthDate: prev.birthDate || userProfile.birthDate || '',
        bfMethod: entries[0]?.bfMethod || 'none'
      }));
    }
  }, [showForm, userProfile, entries]);

  useEffect(() => {
    const currentAge = calculateAge(formData.birthDate);
    setLiveBF(calculateBF(formData.bfMethod, formData.gender, currentAge, formData));
  }, [formData]);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } 
    catch (e) { alert("Erro de autenticação."); }
  };

  const handleLogout = () => signOut(auth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      const timestamp = new Date(formData.date).getTime();
      const currentAge = calculateAge(formData.birthDate);
      const calculatedBFValue = calculateBF(formData.bfMethod, formData.gender, currentAge, formData);

      const newEntry = { ...formData, age: currentAge, calculatedBF: calculatedBFValue, timestamp };
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'measurements', timestamp.toString()), newEntry);
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid), {
        height: formData.height, gender: formData.gender, birthDate: formData.birthDate, lastUpdated: timestamp
      }, { merge: true });

      setUserProfile({ height: formData.height, gender: formData.gender, birthDate: formData.birthDate });
      setShowForm(false);
      setActiveTab('dashboard');
    } catch (e) { alert("Erro ao salvar."); }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    if (confirm('Excluir registro permanentemente?')) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'measurements', id));
    }
  };

  const latestEntry = entries[0];
  
  const chartData = useMemo(() => {
    return [...entries].reverse().map(e => ({
      date: formatDate(e.date),
      weight: parseFloat(e.weight) || 0,
      bf: parseFloat(e.calculatedBF) || null,
      chest: parseFloat(e.chest) || 0,
      waist: parseFloat(e.waist) || 0,
      glutes: parseFloat(e.glutes) || 0,
      arm: parseFloat(e.armRight) || 0,
      thigh: parseFloat(e.thighRight) || 0
    }));
  }, [entries]);

  const renderForm = () => {
    const currentAge = calculateAge(formData.birthDate);
    return (
      <div className="pb-24 animate-fade-in font-sans">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setShowForm(false)} className="p-2 rounded-full hover:bg-slate-800 text-slate-400"><ChevronRight className="rotate-180" /></button>
          <h1 className="text-xl font-bold text-white uppercase tracking-tighter">Novo Diagnóstico</h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <InputGroup title="Perfil Biológico">
            <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400 uppercase font-bold">Gênero</label>
                  <select value={formData.gender} onChange={(e) => setFormData({...formData, gender: e.target.value})} className="bg-slate-900 text-white border border-slate-700 rounded-lg p-2 text-sm outline-none">
                    <option value="male">Masculino</option>
                    <option value="female">Feminino</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                   <label className="text-xs text-slate-400 flex justify-between mb-1 uppercase font-bold">
                     Nascimento {currentAge > 0 && <span className="text-emerald-400 font-bold">({currentAge})</span>}
                   </label>
                   <input type="date" value={formData.birthDate} onChange={(e) => setFormData({...formData, birthDate: e.target.value})} className="w-full bg-slate-900 text-white border border-slate-700 rounded-lg p-2 text-xs outline-none" />
                </div>
            </div>
            <NumberInput label="Altura" value={formData.height} onChange={(v) => setFormData({...formData, height: v})} suffix="cm" />
            <NumberInput label="Peso Atual" value={formData.weight} onChange={(v) => setFormData({...formData, weight: v})} suffix="kg" />
          </InputGroup>

          <div className="mb-4 px-1">
            <label className="text-xs text-blue-400 font-black mb-2 block uppercase tracking-[0.1em] flex items-center gap-2">
              <Calculator size={14} /> Protocolo de Composição Corporal
            </label>
            <select 
                value={formData.bfMethod}
                onChange={(e) => setFormData({...formData, bfMethod: e.target.value})}
                className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2 transition-all text-sm font-semibold"
            >
              <option value="none">Apenas Medidas (Sem BF)</option>
              <option value="navy">Marinha Americana (Fita Métrica)</option>
              <option value="3site">Jackson-Pollock 3 Dobras (Adipômetro)</option>
              <option value="7site">Jackson-Pollock 7 Dobras (Adipômetro)</option>
            </select>
            
            {formData.bfMethod !== 'none' && (
              <div className="bg-blue-500/5 p-4 rounded-2xl border border-blue-500/20 my-4 animate-fade-in space-y-4">
                <div className="flex justify-between items-center border-b border-blue-500/10 pb-3">
                  <h4 className="text-[10px] text-blue-300 font-bold uppercase tracking-widest">Inputs Necessários</h4>
                  {liveBF && <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-lg shadow-blue-500/20 animate-pulse">BF: {liveBF.toFixed(1)}%</span>}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {formData.bfMethod === 'navy' && (
                    <>
                      <NumberInput label="Pescoço" value={formData.neck} onChange={(v) => setFormData({...formData, neck: v})} suffix="cm" />
                      {formData.gender === 'female' && <div className="text-[10px] text-emerald-400 col-span-2 italic">Certifique-se de preencher o Glúteo abaixo.</div>}
                    </>
                  )}
                  
                  {formData.bfMethod === '3site' && (
                    formData.gender === 'male' ? (
                      <>
                        <NumberInput label="Dobra Peitoral" value={formData.skinfoldChest} onChange={(v) => setFormData({...formData, skinfoldChest: v})} suffix="mm" />
                        <NumberInput label="Dobra Abdominal" value={formData.skinfoldAbdomen} onChange={(v) => setFormData({...formData, skinfoldAbdomen: v})} suffix="mm" />
                        <NumberInput label="Dobra da Coxa" value={formData.skinfoldThigh} onChange={(v) => setFormData({...formData, skinfoldThigh: v})} suffix="mm" />
                      </>
                    ) : (
                      <>
                        <NumberInput label="Dobra Tríceps" value={formData.skinfoldTriceps} onChange={(v) => setFormData({...formData, skinfoldTriceps: v})} suffix="mm" />
                        <NumberInput label="Dobra Suprailíaca" value={formData.skinfoldSuprailiac} onChange={(v) => setFormData({...formData, skinfoldSuprailiac: v})} suffix="mm" />
                        <NumberInput label="Dobra da Coxa" value={formData.skinfoldThigh} onChange={(v) => setFormData({...formData, skinfoldThigh: v})} suffix="mm" />
                      </>
                    )
                  )}
                  
                  {formData.bfMethod === '7site' && (
                    <>
                      <NumberInput label="Dobra Peitoral" value={formData.skinfoldChest} onChange={(v) => setFormData({...formData, skinfoldChest: v})} suffix="mm" />
                      <NumberInput label="Dobra Axilar" value={formData.skinfoldAxilla} onChange={(v) => setFormData({...formData, skinfoldAxilla: v})} suffix="mm" />
                      <NumberInput label="Dobra Tríceps" value={formData.skinfoldTriceps} onChange={(v) => setFormData({...formData, skinfoldTriceps: v})} suffix="mm" />
                      <NumberInput label="Dobra Subescap." value={formData.skinfoldSubscapular} onChange={(v) => setFormData({...formData, skinfoldSubscapular: v})} suffix="mm" />
                      <NumberInput label="Dobra Abdom." value={formData.skinfoldAbdomen} onChange={(v) => setFormData({...formData, skinfoldAbdomen: v})} suffix="mm" />
                      <NumberInput label="Dobra Suprali." value={formData.skinfoldSuprailiac} onChange={(v) => setFormData({...formData, skinfoldSuprailiac: v})} suffix="mm" />
                      <NumberInput label="Dobra Coxa" value={formData.skinfoldThigh} onChange={(v) => setFormData({...formData, skinfoldThigh: v})} suffix="mm" />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <InputGroup title="Perimetria (Tronco)">
            <NumberInput label="Peitoral" value={formData.chest} onChange={(v) => setFormData({...formData, chest: v})} suffix="cm" />
            <NumberInput label="Cintura (Umbilical)" value={formData.waist} onChange={(v) => setFormData({...formData, waist: v})} suffix="cm" />
            <NumberInput label="Quadril" value={formData.hips} onChange={(v) => setFormData({...formData, hips: v})} suffix="cm" />
            <NumberInput label="Glúteo" value={formData.glutes} onChange={(v) => setFormData({...formData, glutes: v})} suffix="cm" />
          </InputGroup>

          <InputGroup title="Perimetria (Membros)">
            <NumberInput label="Braço Dir." value={formData.armRight} onChange={(v) => setFormData({...formData, armRight: v})} suffix="cm" />
            <NumberInput label="Braço Esq." value={formData.armLeft} onChange={(v) => setFormData({...formData, armLeft: v})} suffix="cm" />
            <NumberInput label="Antebraço Dir." value={formData.forearmRight} onChange={(v) => setFormData({...formData, forearmRight: v})} suffix="cm" />
            <NumberInput label="Antebraço Esq." value={formData.forearmLeft} onChange={(v) => setFormData({...formData, forearmLeft: v})} suffix="cm" />
            <NumberInput label="Coxa Dir." value={formData.thighRight} onChange={(v) => setFormData({...formData, thighRight: v})} suffix="cm" />
            <NumberInput label="Coxa Esq." value={formData.thighLeft} onChange={(v) => setFormData({...formData, thighLeft: v})} suffix="cm" />
            <NumberInput label="Panturrilha Dir." value={formData.calfRight} onChange={(v) => setFormData({...formData, calfRight: v})} suffix="cm" />
            <NumberInput label="Panturrilha Esq." value={formData.calfLeft} onChange={(v) => setFormData({...formData, calfLeft: v})} suffix="cm" />
          </InputGroup>

          <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50 mb-4 shadow-sm">
            <h3 className="text-emerald-400 text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2"><Camera size={14} /> Registros Fotográficos</h3>
            <div className="grid grid-cols-3 gap-3">
              <PhotoUploader label="Frente" currentImage={formData.photoFront} onImageSelect={(img) => setFormData({...formData, photoFront: img})} />
              <PhotoUploader label="Lado" currentImage={formData.photoSide} onImageSelect={(img) => setFormData({...formData, photoSide: img})} />
              <PhotoUploader label="Costas" currentImage={formData.photoBack} onImageSelect={(img) => setFormData({...formData, photoBack: img})} />
            </div>
          </div>

          <div className="px-1">
             <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block">Data da Sessão</label>
             <input type="date" required value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-900 text-white border border-slate-700 rounded-xl p-3 text-sm outline-none shadow-inner" />
          </div>

          <button type="submit" className="w-full bg-emerald-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all uppercase tracking-widest">Salvar Diagnóstico</button>
        </form>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-6 pb-20 animate-fade-in font-sans">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Olá, {user.displayName?.split(' ')[0]}</h1>
          <p className="text-slate-500 text-xs font-bold tracking-widest uppercase">Evolução em Tempo Real</p>
        </div>
        <div className="flex gap-2">
           <button onClick={handleLogout} className="bg-slate-800 p-3 rounded-full text-slate-400 shadow-sm border border-slate-700 transition-colors"><LogOut size={18} /></button>
           <button onClick={() => { setShowForm(true); setActiveTab('log'); }} className="bg-emerald-500 text-white p-3 rounded-full shadow-lg shadow-emerald-500/30 active:scale-95"><PlusCircle size={22} /></button>
        </div>
      </header>

      {entries.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard title="Peso Corporal" value={latestEntry?.weight} unit="kg" icon={Scale} />
            <MetricCard title="Gordura Estimada" value={latestEntry?.calculatedBF?.toFixed(1)} unit="%" icon={Activity} color="blue" />
          </div>

          <div className="bg-slate-800 rounded-3xl p-5 border border-slate-700 shadow-sm">
            <div className="flex flex-col gap-4 mb-6">
              <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500" /> Curva Analítica</h3>
              <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                <button onClick={() => setChartView('summary')} className={`flex-1 py-1.5 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest ${chartView === 'summary' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}>COMPOSTA</button>
                <button onClick={() => setChartView('measures')} className={`flex-1 py-1.5 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest ${chartView === 'measures' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}>PERÍMETROS</button>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartView === 'summary' ? (
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                      <linearGradient id="colorBF" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={25} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '10px', color: '#fff' }} 
                      formatter={(val) => typeof val === 'number' ? val.toFixed(1) : val}
                    />
                    <Area type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorWeight)" name="Peso" />
                    <Area type="monotone" dataKey="bf" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorBF)" name="Gordura" />
                  </AreaChart>
                ) : (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={25} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '10px' }} 
                      formatter={(val) => typeof val === 'number' ? val.toFixed(1) : val}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '8px', paddingTop: '15px' }} />
                    <Line type="monotone" dataKey="chest" stroke="#f59e0b" strokeWidth={2} name="Peito" />
                    <Line type="monotone" dataKey="waist" stroke="#ec4899" strokeWidth={2} name="Cintura" />
                    <Line type="monotone" dataKey="glutes" stroke="#8b5cf6" strokeWidth={2} name="Glúteo" />
                    <Line type="monotone" dataKey="arm" stroke="#3b82f6" strokeWidth={2} name="Braço" />
                    <Line type="monotone" dataKey="thigh" stroke="#06b6d4" strokeWidth={2} name="Coxa" />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-3xl p-5 border border-slate-700 shadow-inner">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-white font-black text-[10px] uppercase tracking-[0.25em]">Snapshot Biométrico</h3>
               <span className="text-[10px] text-slate-500 font-bold">{formatDate(latestEntry.date)}</span>
             </div>
             <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 shadow-sm"><div className="text-[9px] text-slate-500 font-black mb-1 uppercase tracking-wider">CINTURA</div><div className="text-white text-sm font-black">{latestEntry.waist || '-'}</div></div>
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 shadow-sm"><div className="text-[9px] text-slate-500 font-black mb-1 uppercase tracking-wider">GLÚTEO</div><div className="text-white text-sm font-black">{latestEntry.glutes || '-'}</div></div>
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800 shadow-sm">
                  <div className="text-[9px] text-slate-500 font-black mb-1 uppercase tracking-wider">M. MAGRA</div>
                  <div className="text-emerald-400 text-sm font-black">{latestEntry.weight && latestEntry.calculatedBF ? (latestEntry.weight * (1 - latestEntry.calculatedBF/100)).toFixed(1) : '-'} <span className="text-[9px]">kg</span></div>
                </div>
             </div>
          </div>
        </>
      )}
    </div>
  );

  const renderHistory = () => (
    <div className="pb-24 animate-fade-in font-sans">
      <header className="mb-10">
        <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Histórico Diagnóstico</h1>
        <p className="text-slate-500 text-[10px] font-bold tracking-[0.2em] uppercase">{entries.length} diagnósticos no banco</p>
      </header>
      <div className="space-y-8">
        {entries.map((entry) => (
          <div key={entry.id} className="bg-slate-900 rounded-[2.5rem] overflow-hidden border border-slate-800 shadow-2xl transition-all hover:border-slate-700">
            <div className="p-6 bg-slate-800/40 border-b border-slate-800 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar size={14} className="text-emerald-500" />
                  <span className="font-black text-xl text-white tracking-tighter uppercase">{formatDate(entry.date)}</span>
                </div>
                <div className="flex gap-4 text-[10px] uppercase font-black tracking-widest">
                  <span className="text-emerald-400">{entry.weight} kg</span>
                  {entry.calculatedBF && <span className="text-blue-400">{entry.calculatedBF.toFixed(1)}% BF</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(entry.id)} className="text-slate-600 hover:text-red-400 p-2.5 bg-slate-950 rounded-full border border-slate-800 transition-colors shadow-sm"><Trash2 size={16} /></button>
            </div>
            
            {(entry.photoFront || entry.photoBack || entry.photoSide) && (
              <div className="p-4 bg-black/30">
                <div className="grid grid-cols-3 gap-2">
                  {['photoFront', 'photoSide', 'photoBack'].map(key => entry[key] && (
                    <div key={key} className="relative group cursor-zoom-in" onClick={() => setFullscreenImage(entry[key])}>
                      <div className="aspect-[3/4] bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 shadow-inner">
                        <img src={entry[key]} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-2xl">
                        <Maximize2 size={24} className="text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.25em] flex items-center gap-2 border-b border-slate-800 pb-2"><Ruler size={10}/> Perimetria Clínica (cm)</h4>
                <div className="grid grid-cols-4 gap-2.5">
                  {[
                    { l: 'Peito', v: entry.chest }, { l: 'Cint.', v: entry.waist }, { l: 'Glút.', v: entry.glutes }, { l: 'Quad.', v: entry.hips },
                    { l: 'B. Dir', v: entry.armRight }, { l: 'B. Esq', v: entry.armLeft }, { l: 'Ant.D', v: entry.forearmRight }, { l: 'Ant.E', v: entry.forearmLeft },
                    { l: 'C. Dir', v: entry.thighRight }, { l: 'C. Esq', v: entry.thighLeft }, { l: 'P. Dir', v: entry.calfRight }, { l: 'P. Esq', v: entry.calfLeft }
                  ].map(m => m.v && (
                    <div key={m.l} className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800 shadow-sm text-center">
                      <div className="text-[8px] text-slate-500 font-black truncate uppercase mb-1">{m.l}</div>
                      <div className="text-xs text-white font-black">{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {entry.bfMethod !== 'none' && (
                <div className="space-y-4 pt-2">
                   <h4 className="text-[10px] font-black uppercase text-blue-500/60 tracking-[0.25em] flex items-center gap-2 border-b border-blue-900/30 pb-2"><Calculator size={10}/> Plicometria (mm)</h4>
                   <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { l: 'Peit.', v: entry.skinfoldChest }, { l: 'Abd.', v: entry.skinfoldAbdomen }, { l: 'Coxa', v: entry.skinfoldThigh }, { l: 'Tríc.', v: entry.skinfoldTriceps },
                        { l: 'Supr.', v: entry.skinfoldSuprailiac }, { l: 'Axil.', v: entry.skinfoldAxilla }, { l: 'Sub.', v: entry.skinfoldSubscapular }
                      ].map(d => d.v && (
                        <div key={d.l} className="bg-blue-500/5 p-2 rounded-lg">
                          <div className="text-[7px] text-blue-400 font-black uppercase">{d.l}</div>
                          <div className="text-[11px] text-white font-bold">{d.v}</div>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) return <div className="bg-slate-950 min-h-screen flex items-center justify-center"><Activity className="animate-spin text-emerald-500" size={32} /></div>;
  if (!user) return <LoginScreen onLogin={handleGoogleLogin} />;

  return (
    <div className="bg-slate-950 min-h-screen font-sans text-slate-200 selection:bg-emerald-500 selection:text-white relative">
      <div className="max-w-md mx-auto min-h-screen flex flex-col relative bg-slate-950 shadow-2xl border-x border-slate-900">
        <main className="flex-1 p-5 overflow-y-auto">
          {showForm ? renderForm() : (activeTab === 'dashboard' ? renderDashboard() : renderHistory())}
        </main>
        
        {!showForm && (
          <nav className="sticky bottom-0 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 px-8 py-5 flex justify-between items-center z-40 rounded-t-[2.5rem] shadow-[0_-15px_40px_rgba(0,0,0,0.6)]">
            <button onClick={() => { setActiveTab('dashboard'); setChartView('summary'); }} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'dashboard' ? 'text-emerald-400 scale-110 font-black' : 'text-slate-600 hover:text-slate-300'}`}>
              <Activity size={22} /><span className="text-[9px] uppercase tracking-widest">Painel</span>
            </button>
            <div className="relative -top-10">
              <button onClick={() => setShowForm(true)} className="bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white p-4.5 rounded-full shadow-[0_15px_30px_rgba(16,185,129,0.4)] border-[6px] border-slate-950 hover:scale-105 active:scale-90 transition-transform">
                <PlusCircle size={34} />
              </button>
            </div>
            <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'history' ? 'text-emerald-400 scale-110 font-black' : 'text-slate-600 hover:text-slate-300'}`}>
              <Calendar size={22} /><span className="text-[9px] uppercase tracking-widest">Histórico</span>
            </button>
          </nav>
        )}
      </div>

      {fullscreenImage && (
        <div className="fixed inset-0 z-[100] bg-black/98 backdrop-blur-md flex flex-col animate-fade-in" onClick={() => setFullscreenImage(null)}>
          <div className="flex justify-end p-6"><button className="bg-slate-900/50 p-3 rounded-full text-white border border-slate-800"><X size={24} /></button></div>
          <div className="flex-1 flex items-center justify-center p-6">
            <img src={fullscreenImage} className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/5" />
          </div>
          <p className="text-center text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] pb-10">Toque para fechar</p>
        </div>
      )}
    </div>
  );
}
