import React, { useState, useEffect } from 'react';
// Importações do Firebase
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  onSnapshot,
  deleteDoc,
  doc,
  setDoc, 
  updateDoc, 
  setLogLevel,
  collectionGroup,
  where,
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

// --- NOVO: Importação dos seus arquivos de logo ---
import claveLogo from './assets/clave.png';
import rodaLogo from './assets/roda.png'; // (Assumindo que o nome do arquivo da roda é 'roda.png')
import loginLogo from './assets/logo-login.png';
import wazeLogo from './assets/waze.png';
import mapsLogo from './assets/maps.png';

/*
  LEIA ANTES DE RODAR: INSTRUÇÕES DO IMPLEMENTADOR (Passo 36)
  ... (comentários omitidos para brevidade) ...
*/

// **********************************************************
// LISTA DE ADMINS (Adicione o e-mail dela aqui)
// **********************************************************
const ADMIN_EMAILS = [
  "arthurpuron@gmail.com",
  "racheelpuroonmusica@gmail.com" 
];

// **********************************************************
// Chaves de Configuração (Base Correta)
// **********************************************************
const firebaseConfig = {
  apiKey: "AIzaSyBlmPHXVo0isazUuPN7R76f1Y3Xcohad94",
  authDomain: "agenda-musicos-f6f01.firebaseapp.com",
  projectId: "agenda-musicos-f6f01",
  storageBucket: "agenda-musicos-f6f01.firebasestorage.app",
  messagingSenderId: "344652513076",
  appId: "1:344652513076:web:4ab3595d5ec6ceeb5a2f61"
};

// Validação para garantir que as variáveis foram carregadas
if (!firebaseConfig.apiKey) {
  console.error("Erro: Variáveis de ambiente do Firebase não carregadas.");
}

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); // O Auth do Firebase
setLogLevel('Debug');

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

// --- Funções Helper ---
// ... (Todo o código helper como getLocalTimeZone, formatDisplayDate, etc. está idêntico) ...
const getLocalTimeZone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};
const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    const hour = h.toString().padStart(2, '0');
    options.push(`${hour}:00`);
    options.push(`${hour}:30`);
  }
  return options;
};
const timeOptions = generateTimeOptions();
const pacotesOptions = ['Harmonie', 'Intimist', 'Essence'];
const formatDisplayDate = (dataInicioISO, dataFimISO) => {
  try {
    const start = new Date(dataInicioISO);
    const end = new Date(dataFimISO);
    const dateStr = start.toLocaleDateString('pt-BR', { dateStyle: 'short' });
    const startTimeStr = start.toLocaleTimeString('pt-BR', { timeStyle: 'short' });
    const endTimeStr = end.toLocaleTimeString('pt-BR', { timeStyle: 'short' });
    return `${dateStr}, ${startTimeStr} - ${endTimeStr}`;
  } catch (e) {
    console.error("Erro ao formatar data:", e);
    return "Data inválida";
  }
};
const formatCurrency = (valor) => {
  const num = parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
const formatDateForInput = (isoDate) => {
  if (!isoDate) return '';
  try {
    return isoDate.split('T')[0];
  } catch (e) {
    return '';
  }
};
const buildCachetsMap = (musicosArray = []) => {
  return musicosArray.reduce((acc, musico) => {
    acc[musico.id] = musico.cachet;
    return acc;
  }, {});
};

// Função para pegar iniciais do nome (Adicione isto!)
const getInitials = (name) => {
  if (!name) return '';
  const names = name.trim().split(/\s+/);
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
};

function App() {
  // --- Estados da Autenticação ---
  const [gapiClient, setGapiClient] = useState(null);
  const [isCalendarReady, setIsCalendarReady] = useState(false);
  
  // --- Estados do Firebase ---
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true); // Este estado é a chave

  // --- NOVO ESTADO DE AUTORIZAÇÃO ---
const [userRole, setUserRole] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // --- Estados da Aplicação ---
  const [globalError, setGlobalError] = useState(null);
  const [page, setPage] = useState('eventos');
  const [musicos, setMusicos] = useState([]);
  const [loadingMusicos, setLoadingMusicos] = useState(true);
  const [eventos, setEventos] = useState([]);
  const [loadingEventos, setLoadingEventos] = useState(true);
  
  // --- Estados dos Modais (ATUALIZADO) ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEvento, setSelectedEvento] = useState(null);
  const [eventoParaEditar, setEventoParaEditar] = useState(null);

  // --- Caminhos das Coleções ---
  const getMusicosCollectionPath = () => {
    if (userRole !== 'admin' || !userId) return null;
    return `users/${userId}/musicos`;
  };
  const getEventosCollectionPath = () => {
    if (userRole !== 'admin' || !userId) return null;
    return `users/${userId}/eventos`;
  };

  // **********************************************************
  // 2. Observador de Autenticação (A SOLUÇÃO DE PERSISTÊNCIA)
  // (Idêntico ao anterior, 100% funcional)
  // **********************************************************
// Observador de Autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("onAuthStateChanged: Usuário encontrado.", user.email);
        setUserId(user.uid);
        setUserProfile({
          name: user.displayName,
          email: user.email,
          picture: user.photoURL,
        });

        // AQUI MUDOU: Verifica se o e-mail está na lista de admins
        if (ADMIN_EMAILS.includes(user.email)) {
          setUserRole('admin');
          console.log("Status de Acesso: ADMIN");
          const storedToken = localStorage.getItem('gapi_access_token');
          
          if (storedToken) {
            const scriptGapi = document.createElement('script');
            scriptGapi.src = 'https://apis.google.com/js/api.js';
            scriptGapi.async = true;
            scriptGapi.defer = true;
            scriptGapi.onload = () => initializeGapi(storedToken);
            document.body.appendChild(scriptGapi);
          } else {
            setAuthLoading(false);
          }
        } else {
          setUserRole('musician');
          console.log("Status de Acesso: MÚSICO");
          setAuthLoading(false);
        }
        
        setIsDbReady(true);
        setGlobalError(null);

      } else {
        console.log("onAuthStateChanged: Usuário nulo.");
        setUserId(null);
        setUserProfile(null);
        setIsDbReady(false);
        setUserRole(null);
        setIsCalendarReady(false);
        setGapiClient(null);
        setGlobalError(null);
        setMusicos([]);
        setEventos([]);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 3. Carregamento de Músicos (Idêntico)
  useEffect(() => {
    const collectionPath = getMusicosCollectionPath();
    if (!isDbReady || !collectionPath || userRole !== 'admin' || !isCalendarReady) {
      setMusicos([]);
      setLoadingMusicos(false);
      return;
    };
    // ... (lógica restante idêntica)
    setLoadingMusicos(true);
    const q = query(collection(db, collectionPath));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const musicosData = [];
        querySnapshot.forEach((doc) => {
          musicosData.push({ id: doc.id, ...doc.data() });
        });
        setMusicos(musicosData);
        setLoadingMusicos(false);
      }, (err) => {
        console.error("[Firestore] Erro ao carregar músicos:", err);
        setGlobalError("Erro ao carregar lista de músicos.");
        setLoadingMusicos(false);
      }
    );
    return () => unsubscribe();
  }, [isDbReady, userId, userRole, isCalendarReady]);

  // 4. Carregamento de Eventos (Idêntico)
  useEffect(() => {
    if (!isDbReady || !userProfile || !userRole) {
      setEventos([]);
      setLoadingEventos(false);
      return;
    };
    // ... (lógica restante idêntica)
    if (userRole === 'admin' && !isCalendarReady) {
      setEventos([]);
      setLoadingEventos(false);
      return;
    }
    setLoadingEventos(true);
    let q;
    if (userRole === 'admin') {
      const collectionPath = getEventosCollectionPath();
      q = query(collection(db, collectionPath));
    } else if (userRole === 'musician') {
      q = query(
        collectionGroup(db, 'eventos'),
        where('musicoEmails', 'array-contains', userProfile.email)
      );
    }
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const eventosData = [];
        querySnapshot.forEach((doc) => {
          eventosData.push({ id: doc.id, ...doc.data() });
        });
        eventosData.sort((a, b) => new Date(a.dataInicio) - new Date(b.dataInicio));
        setEventos(eventosData);
        setLoadingEventos(false);
      }, (err) => {
        console.error("[Firestore] Erro ao carregar eventos:", err);
        setGlobalError("Erro ao carregar lista de eventos. (Se for Músico, verifique se o Índice do Firestore foi criado. Veja o console F12 para o link.)");
        setLoadingEventos(false);
      }
    );
    return () => unsubscribe();
  }, [isDbReady, userId, userRole, userProfile, isCalendarReady]);

  // --- Funções de Inicialização GAPI (Idêntico) ---
 const initializeGapi = (accessToken) => {
    window.gapi.load('client', () => {
      window.gapi.client
        .init({
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
          ],
        })
        .then(() => {
          window.gapi.client.setToken({ access_token: accessToken });
          setGapiClient(window.gapi);
          setIsCalendarReady(true);
          console.log("GAPI client inicializado E autorizado.");
          setAuthLoading(false);
        })
        .catch((e) => {
          console.error('Erro ao inicializar GAPI client:', e);
          setGlobalError('Erro ao inicializar GAPI client.');
          setAuthLoading(false);
        });
    });
  };

  // --- Funções de Autenticação Google (Idêntico e simplificado) ---
 const handleAuthClick = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login Google:", e);
      // Apenas loga, não mostra erro na tela
    }
  };
const handleCalendarAuth = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(CALENDAR_SCOPE); 
      const result = await signInWithPopup(auth, provider); 
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      if (token) {
        localStorage.setItem('gapi_access_token', token);
        const scriptGapi = document.createElement('script');
        scriptGapi.src = 'https://apis.google.com/js/api.js';
        scriptGapi.async = true;
        scriptGapi.defer = true;
        scriptGapi.onload = () => initializeGapi(token); 
        document.body.appendChild(scriptGapi);
      }
    } catch (e) {
      console.error("Erro calendário:", e);
      // Apenas loga, não mostra erro na tela
    }
  };

  const handleSignoutClick = async () => {
    try {
      localStorage.removeItem('gapi_access_token');
      await signOut(auth);
      console.log('Firebase Auth: Deslogado.');
    } catch (e) {
      console.error("Erro ao deslogar:", e);
      setGlobalError("Erro ao tentar sair.");
    }
  };
  
  // Deletar Evento (Idêntico)
  const handleDeleteEvento = async (eventoId) => {
  	// ... (código idêntico)
    if (userRole !== 'admin') return; 
    const collectionPath = getEventosCollectionPath();
    if (!collectionPath) {
      setGlobalError("Erro de conexão (User ID nulo).");
      return;
    }
    const result = await Swal.fire({
      title: 'Tem certeza que deseja deletar?',
      text: "(Isso NÃO o removerá do Google Calendar, apenas da lista do app.)",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sim, deletar!',
      cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, collectionPath, eventoId));
        console.log("Evento deletado do Firestore.");
        Swal.fire('Deletado!','O evento foi removido da sua lista.','success');
      } catch (e) {
        console.error("[Firestore] Erro ao deletar evento:", e);
        setGlobalError("Não foi possível deletar o evento do Firestore.");
        Swal.fire('Erro!','Não foi possível deletar o evento.','error');
      }
    }
  };

const renderHeader = () => (
    <header className="w-full bg-[#162A3A] relative">
      
      {(isMenuOpen || isUserMenuOpen) && (
        <div 
          className="fixed inset-0 z-20 bg-black bg-opacity-50 backdrop-blur-sm"
          onClick={() => {
            setIsMenuOpen(false);
            setIsUserMenuOpen(false);
          }}
        />
      )}

      <div className="pt-0 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-start"> 
          <div className="flex items-center pt-1">
            {userRole === 'admin' && (
              <button
                onClick={() => {
                  setIsMenuOpen(!isMenuOpen);
                  setIsUserMenuOpen(false);
                }}
                className="text-[#C69874] hover:text-white focus:outline-none relative z-30"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>
            )}
          </div>

          <div className="relative z-30">
            <button 
              onClick={() => {
                setIsUserMenuOpen(!isUserMenuOpen);
                setIsMenuOpen(false);
              }}
              className="focus:outline-none"
            >
              {userProfile.picture ? (
                <img
                  className="h-10 w-10 rounded-full object-cover border-2 border-[#C69874] p-0.5"
                  src={userProfile.picture}
                  alt="Foto do Perfil"
                />
              ) : (
                <Avatar name={userProfile.name} />
              )}
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#2A3E4D] rounded-xl shadow-2xl py-2 ring-1 ring-black ring-opacity-5 border border-[#C69874]">
                 <div className="px-4 py-3 border-b border-[#162A3A] bg-[#233442] rounded-t-xl mb-1">
                    <p className="text-xs text-[#A9B4BD] uppercase tracking-wider">Logado como</p>
                    <p className="text-sm text-[#F5F0ED] font-bold truncate">{userProfile.name}</p>
                 </div>
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    handleSignoutClick();
                  }}
                  className="block w-full text-left px-4 py-3 text-sm text-[#C69874] hover:bg-[#162A3A] transition-colors font-medium"
                >
                  Sair da Conta
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex justify-center mt-4 mb-4">
           <h1 className="text-xl font-bold text-[#C69874]">
            Agenda de Eventos
          </h1>
        </div>
      </div>
      
      {isMenuOpen && userRole === 'admin' && (
        <div className="fixed top-0 left-0 h-full w-72 bg-[#2A3E4D] shadow-2xl z-30 flex flex-col">
          <div className="p-6 bg-[#162A3A] flex items-center justify-between">
            <span className="text-[#C69874] font-bold text-xl">Menu</span>
            <button onClick={() => setIsMenuOpen(false)} className="text-gray-400 hover:text-white">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <div className="flex flex-col py-2">
            <button
              onClick={() => {
                setPage('eventos');
                setIsMenuOpen(false);
              }}
              className={`text-left px-6 py-4 font-medium transition-all duration-200 border-l-4
                ${page === 'eventos' ? 'border-[#C69874] bg-[#233442] text-[#C69874]' : 'border-transparent text-[#F5F0ED] hover:bg-[#162A3A]'}
              `}
            >
              Eventos
            </button>
            <button
              onClick={() => {
                setPage('musicos');
                setIsMenuOpen(false);
              }}
              className={`text-left px-6 py-4 font-medium transition-all duration-200 border-l-4
                ${page === 'musicos' ? 'border-[#C69874] bg-[#233442] text-[#C69874]' : 'border-transparent text-[#F5F0ED] hover:bg-[#162A3A]'}
              `}
            >
              Músicos
            </button>
          </div>
        </div>
      )}
    </header>
);
 // --- NOVO: Tela de Autorização do Admin (Atualizada com a Paleta) ---
const AdminAuthScreen = () => (
    <div className="max-w-lg mx-auto mt-10 bg-[#2A3E4D] rounded-2xl shadow-2xl border border-[#C69874]/30 p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 bg-[#162A3A] rounded-full flex items-center justify-center border-2 border-[#C69874] shadow-lg">
          <svg className="w-10 h-10 text-[#C69874]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-[#F5F0ED] mb-3 tracking-wide">
        Sincronização de Agenda
      </h2>
      
      <p className="text-[#A9B4BD] mb-8 leading-relaxed">
        Para gerenciar os eventos com eficiência, precisamos conectar ao seu Google Calendar.
      </p>
      
      <button
        onClick={handleCalendarAuth}
        className="w-full bg-[#C69874] hover:bg-[#b08463] text-[#162A3A] font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        Autorizar Google Calendar
      </button>
    </div>
  );
  const AdminDashboard = () => (
  	// ... (código idêntico)
    <>
      {page === 'eventos' && renderEventosPage()}
      {page === 'musicos' && renderMusicosPage()}
    </>
  );
const MusicianDashboard = () => (
    <div className="w-full text-center">
      <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F0ED] mb-6 border-b border-[#C69874] pb-2 inline-block">
        Meus Próximos Eventos
      </h2>
      {loadingEventos && <p className="text-[#A9B4BD]">Carregando seus eventos...</p>}
      {!loadingEventos && eventos.length === 0 && (
        <div className="bg-[#2A3E4D] p-6 rounded-xl shadow-lg text-center border border-[#162A3A]">
           <p className="text-[#A9B4BD]">Você ainda não foi convidado para nenhum evento.</p>
        </div>
      )}
      {!loadingEventos && eventos.length > 0 && (
        <ul className="space-y-4 text-left">
          {eventos.map(evento => (
            <li key={evento.id}>
              <div
                className="bg-[#2A3E4D] p-5 rounded-xl shadow-lg cursor-pointer border-l-4 border-[#C69874] hover:bg-[#344a5c] transition-colors flex justify-between items-center"
                onClick={() => setSelectedEvento(evento)}
              >
                <div>
                  <p className="text-xl font-bold text-[#F5F0ED] mb-1">{evento.nome}</p>
                  <p className="text-sm text-[#A9B4BD] mb-2">{evento.cidade}</p>
                  <p className="text-sm text-[#F5F0ED]">
                    {formatDisplayDate(evento.dataInicio, evento.dataFim)}
                  </p>
                </div>
                <div className="pl-2">
                   <StatusBadge status={evento.status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
// --- Componente: Aba de Eventos (ADMIN) ---
const renderEventosPage = () => (
    <div>
      <div className="mb-6">
        <button
          onClick={() => setShowAddModal(true)}
          className="w-auto bg-[#C69874] hover:opacity-90 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition duration-300"
      	>
          + Novo Evento
      	</button>
    	</div>

    	{loadingEventos && <p>Carregando eventos...</p>}
    	{!loadingEventos && eventos.length === 0 && (
      	<p className="text-gray-400">Nenhum evento cadastrado ainda.</p>
    	)}
    	{!loadingEventos && eventos.length > 0 && (
      	<ul className="space-y-4">
        	{eventos.map(evento => (
          	<li 
            	key={evento.id}
            	className="bg-[#2A3E4D] p-4 rounded-lg shadow-md cursor-pointer flex justify-between items-start"
				onClick={() => setSelectedEvento(evento)}
          	>
            	<div className="flex flex-col">
              	<p className="text-xl font-bold text-[#F5F0ED]">{evento.nome}</p>
              	<p className="text-sm text-[#A9B4BD]">{evento.cidade}</p>
              	
                <div className="mt-4">
                    <p className="text-base text-[#F5F0ED]">
                        {new Date(evento.dataInicio).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-base text-[#F5F0ED]">
                        {new Date(evento.dataInicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {new Date(evento.dataFim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            	</div>
            	
            	<div className="flex flex-col items-end justify-between h-full min-h-[120px]">
              	<StatusBadge status={evento.status} />
              	
              	<div className="flex mt-4">
                	<button
                  	onClick={(e) => {
                    	e.stopPropagation(); 
                    	setEventoParaEditar(evento);
                  	}}
                  	className="text-[#C69874] hover:text-white p-2 rounded-full transition duration-300"
                  	title="Editar evento"
                	>
                  	<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"></path></svg>
                	</button>

                	<button
                  	onClick={(e) => {
                    	e.stopPropagation();
                    	handleDeleteEvento(evento.id);
                  	}}
                  	className="text-[#C69874] hover:text-red-500 p-2 ml-2 rounded-full transition duration-300"
                  	title="Deletar evento do app"
                	>
                  	<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                	</button>
              	</div>
            	</div>
          	</li>
        	))}
      	</ul>
    	)}
  	</div>
);
	
  const renderMusicosPage = () => (
  	// ... (código idêntico)
    <MusicosManager
      musicos={musicos}
      loading={loadingMusicos}
      collectionPath={getMusicosCollectionPath()}
      setError={setGlobalError} 
    />
  );


  // --- Renderização Principal ---

  // **********************************************************
  // <<< INÍCIO DA ATUALIZAÇÃO DA TELA DE LOADING >>>
  // **********************************************************
  
  // Mostra a NOVA tela de loading animada
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo-container">
          {/* Imagem estática (Clave) - Fica por cima */}
          <img 
            src={claveLogo} 
            alt="Clave de Sol" 
          	className="loading-logo-static" 
          />
          {/* Imagem giratória (Roda) - Fica por baixo */}
          <img 
            src={rodaLogo} 
          	alt="Carregando..." 
          	className="loading-logo-spin" 
          />
      	</div>
      </div>
    );
  }
  
  // **********************************************************
  // <<< FIM DA ATUALIZAÇÃO DA TELA DE LOADING >>>
  // **********************************************************
  
// Tela de Login (Se o Firebase não tiver usuário E o loading terminou)
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-[#162A3A] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#2A3E4D] rounded-2xl shadow-2xl p-8 text-center border border-[#C69874]/30">
          
          <div className="flex justify-center mb-8">
             <img 
               src={loginLogo} 
               alt="Logo da Empresa" 
               className="h-56 object-contain drop-shadow-xl" 
             />
          </div>

          <h1 className="text-3xl font-bold text-[#F5F0ED] mb-3 tracking-wide">
            Bem-vindo(a)
          </h1>
          
          <p className="text-[#A9B4BD] mb-8 text-sm leading-relaxed">
            Acesse sua agenda de eventos musicais com exclusividade e sofisticação.
          </p>

          {globalError && <ErrorMessage message={globalError} />}
          
          <button
            onClick={handleAuthClick}
            className="w-full bg-[#C69874] hover:bg-[#b08463] text-[#162A3A] font-bold py-3.5 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
            </svg>
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }
  // Tela Principal (Logado e Autorizado)
  // (Só chega aqui se authLoading = false E userProfile = true)
  return (
<div className="min-h-screen bg-[#162A3A] text-[#F5F0ED] font-sans">
	{renderHeader()}
    	
    	<main className="py-6 px-4 sm:px-6 lg:px-8">
      	{globalError && <ErrorMessage message={globalError} onDismiss={() => setGlobalError(null)} />}

      	{/* ATUALIZADO: Renderização condicional de Painel */}
      	{userRole === 'admin' && !isCalendarReady && <AdminAuthScreen />}
      	{userRole === 'admin' && isCalendarReady && <AdminDashboard />}
      	{userRole === 'musician' && <MusicianDashboard />}
    	</main>

    	{/* O Modal de Adicionar/Editar Evento (SÓ PARA ADMIN) */}
    	{(showAddModal || eventoParaEditar) && userRole === 'admin' && isCalendarReady && (
      	<AddEventModal
        	onClose={() => {
          	setShowAddModal(false);
          	setEventoParaEditar(null); // Fecha ambos os modos
        	}}
        	musicosCadastrados={musicos}
        	gapiClient={gapiClient}
        	eventosCollectionPath={getEventosCollectionPath()}
        	eventoParaEditar={eventoParaEditar} // Passa o evento para preencher
      	/>
    	)}
    	
  	{/* O Modal de Visualizar Evento (ADMIN E MÚSICO) */}
  	{selectedEvento && (
    	<ViewEventModal
      	evento={selectedEvento}
      	onClose={() => setSelectedEvento(null)}
      	userRole={userRole} // NOVO: Passa o papel
      	userEmail={userProfile.email} // NOVO: Passa o email
    	/>
  	)}
  	</div>
  );
}

// --- Componentes Auxiliares ---

// (Todos os componentes auxiliares, como ViewEventModal, AddEventModal,
// MusicosManager, FormInput, FormSelect, TabButton, ErrorMessage,
// InfoItem, StatusBadge, e Avatar são IDÊNTICOS ao código anterior.
// Eles estão corretos e não precisam de mudança.)

// **********************************************************
// ATUALIZAÇÃO (Passo 34/35) - Componente Inteiro Atualizado
// **********************************************************
const ViewEventModal = ({ evento, onClose, userRole, userEmail }) => {
  const [showMapModal, setShowMapModal] = useState(false);
  const isAdmin = userRole === 'admin';
  const startDate = new Date(evento.dataInicio);
  const endDate = new Date(evento.dataFim);
  const dateString = startDate.toLocaleDateString('pt-BR', { 
    day: '2-digit', month: '2-digit', year: 'numeric' 
  });
  const timeString = `${startDate.toLocaleTimeString('pt-BR', { timeStyle: 'short' })} - ${endDate.toLocaleTimeString('pt-BR', { timeStyle: 'short' })}`;
  const myCachet = evento.musicos.find(m => m.email === userEmail)?.cachet || '0';
  
  const encodedAddress = encodeURIComponent(evento.cidade || "");

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-[#2A3E4D] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-[#C69874]/30 relative">
          
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-[#A9B4BD] hover:text-white bg-[#162A3A] rounded-full p-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>

          <div className="p-6 pt-24">
             <div className="flex justify-between items-start mb-6">
                <div className="pr-4">
                   <h3 className="text-2xl font-bold text-[#C69874] leading-tight mb-1">
                     {evento.nome}
                   </h3>
                </div>
                <div className="flex-shrink-0">
                   <StatusBadge status={evento.status} />
                </div>
             </div>

             <div className="space-y-4">
                
                <div className="bg-[#162A3A] p-4 rounded-lg border border-[#374151]">
                   <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Data" value={dateString} />
                      <InfoItem label="Horário" value={timeString} />
                   </div>
                </div>

                <div className="bg-[#162A3A] p-4 rounded-lg border border-[#374151] flex justify-between items-center gap-4">
                   <div className="flex-grow">
                      <InfoItem label="Endereço" value={evento.cidade} />
                   </div>
                   <button 
                      onClick={() => setShowMapModal(true)}
                      className="w-10 h-10 bg-[#2A3E4D] hover:bg-[#374151] border border-[#C69874]/50 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                      title="Traçar Rota"
                   >
                      <svg className="w-5 h-5 text-[#C69874]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                      </svg>
                   </button>
                </div>
                
                <div className="bg-[#162A3A] p-4 rounded-lg border border-[#374151]">
                  {isAdmin ? (
                    <InfoItem label="Pacote" value={evento.pacote} />
                  ) : (
                    <InfoItem label="Seu Cachet" value={formatCurrency(myCachet)} />
                  )}
                  
                   {isAdmin && (
                      <div className="mt-4 pt-4 border-t border-[#374151]">
                         <InfoItem label="Valor Total" value={formatCurrency(evento.valorEvento)} />
                      </div>
                   )}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#C69874] mb-3 uppercase tracking-wider">
                    Músicos Escalados
                  </h4>
                  {evento.musicos && evento.musicos.length > 0 ? (
                    <ul className="divide-y divide-[#374151]">
                      {evento.musicos.map(musico => (
                        <li key={musico.id} className="py-3 flex justify-between items-center">
                          <div>
                            <p className="text-[#F5F0ED] font-medium text-sm">{musico.nome}</p>
                            <p className="text-xs text-[#A9B4BD]">{musico.instrumento}</p>
                          </div>
                          {isAdmin && (
                            <span className="text-[#F5F0ED] font-bold text-sm">
                              {formatCurrency(musico.cachet)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[#A9B4BD] text-sm italic">Nenhum músico escalado.</p>
                  )}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Modal de Escolha de GPS */}
      {showMapModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm"
          onClick={() => setShowMapModal(false)}
        >
          <div 
            className="bg-[#2A3E4D] border border-[#C69874] p-6 rounded-2xl shadow-2xl w-full max-w-xs text-center relative animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowMapModal(false)}
              className="absolute top-3 right-3 text-[#A9B4BD] hover:text-white bg-[#162A3A] rounded-full p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <h3 className="text-xl font-bold text-[#F5F0ED] mb-6 mt-2">Traçar Rota</h3>
            
            <div className="flex justify-center gap-6">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-20 h-20 bg-[#162A3A] hover:bg-[#374151] text-[#F5F0ED] rounded-2xl border border-[#374151] flex flex-col items-center justify-center gap-2 transition-all shadow-lg"
                onClick={() => setShowMapModal(false)}
                title="Google Maps"
              >
                {/* AQUI: Usando a imagem PNG do Maps */}
                <img src={mapsLogo} alt="Google Maps" className="w-10 h-10 object-contain" />
              </a>
              
              <a 
                href={`https://waze.com/ul?q=${encodedAddress}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-20 h-20 bg-[#162A3A] hover:bg-[#374151] text-[#F5F0ED] rounded-2xl border border-[#374151] flex flex-col items-center justify-center gap-2 transition-all shadow-lg"
                onClick={() => setShowMapModal(false)}
                title="Waze"
              >
                {/* AQUI: Usando a imagem PNG do Waze */}
                <img src={wazeLogo} alt="Waze" className="w-10 h-10 object-contain" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
const AddEventModal = ({ onClose, musicosCadastrados, gapiClient, eventosCollectionPath, eventoParaEditar }) => {
  // ... (código idêntico)
  const isEditMode = eventoParaEditar !== null;
  const [nome, setNome] = useState(isEditMode ? eventoParaEditar.nome : '');
  const [data, setData] = useState(isEditMode ? formatDateForInput(eventoParaEditar.dataInicio) : '');
  const [horaInicio, setHoraInicio] = useState(isEditMode ? eventoParaEditar.dataInicio.split('T')[1].substring(0, 5) : '09:00');
  const [horaFim, setHoraFim] = useState(isEditMode ? eventoParaEditar.dataFim.split('T')[1].substring(0, 5) : '10:00');
  const [cidade, setCidade] = useState(isEditMode ? eventoParaEditar.cidade : '');
  const [status, setStatus] = useState(isEditMode ? eventoParaEditar.status : 'A Confirmar');
  const [pacote, setPacote] = useState(isEditMode ? eventoParaEditar.pacote : pacotesOptions[0]);
  const [valorEvento, setValorEvento] = useState(isEditMode ? eventoParaEditar.valorEvento : '');
  const [selectedMusicos, setSelectedMusicos] = useState(isEditMode ? eventoParaEditar.musicos.map(m => m.id) : []);
  const [cachets, setCachets] = useState(isEditMode ? buildCachetsMap(eventoParaEditar.musicos) : {});
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setModalError(null); 
    if (!nome || !data || !horaInicio || !horaFim || !cidade) {
      // Validação básica ainda pode aparecer, ou podemos remover se quiser silêncio total
      // Por enquanto, mantive silencioso via console no setModalError
      console.warn("Campos obrigatórios faltando");
      return;
    }
    setSaving(true);
    try {
      const dataInicioISO = `${data}T${horaInicio}:00`;
      const dataFimISO = `${data}T${horaFim}:00`;
      const fusoHorario = getLocalTimeZone();
      const musicosConvidados = selectedMusicos
        .map(musicoId => {
          const musico = musicosCadastrados.find(m => m.id === musicoId);
          if (musico) {
            return {
              id: musico.id,
              nome: musico.nome,
              email: musico.email,
              instrumento: musico.instrumento,
              cachet: cachets[musicoId] || '0', 
            };
          }
          return null;
        })
        .filter(Boolean);
      
      const eventoParaFirestore = {
        nome,
        cidade,
        status,
        dataInicio: dataInicioISO,
        dataFim: dataFimISO,
        fusoHorario,
        pacote: pacote,
        valorEvento: valorEvento,
        musicos: musicosConvidados,
        musicoEmails: musicosConvidados.map(m => m.email),
      };
      
      const attendees = musicosConvidados.map(musico => ({ email: musico.email }));
      const eventoParaGoogle = {
        summary: nome,
        location: cidade,
        description: `Status: ${status}`,
        start: { dateTime: dataInicioISO, timeZone: fusoHorario },
        end: { dateTime: dataFimISO, timeZone: fusoHorario },
        attendees: attendees,
        reminders: { useDefault: true },
      };

      if (isEditMode) {
        const eventoRef = doc(db, eventosCollectionPath, eventoParaEditar.id);
        if (eventoParaEditar.googleEventId) {
           await gapiClient.client.calendar.events.update({
            calendarId: 'primary',
            eventId: eventoParaEditar.googleEventId,
            resource: eventoParaGoogle,
            sendUpdates: 'all'
          });
          await setDoc(eventoRef, {
            ...eventoParaFirestore,
            googleEventId: eventoParaEditar.googleEventId
          });
        } else {
          const googleResponse = await gapiClient.client.calendar.events.insert({
            calendarId: 'primary',
            resource: eventoParaGoogle,
            sendNotifications: true,
          });
          const newGoogleEventId = googleResponse.result.id;
          await setDoc(eventoRef, {
            ...eventoParaFirestore,
            googleEventId: newGoogleEventId
          });
        }
      } else {
        const docRef = await addDoc(collection(db, eventosCollectionPath), eventoParaFirestore);
        const googleResponse = await gapiClient.client.calendar.events.insert({
          calendarId: 'primary',
          resource: eventoParaGoogle,
          sendNotifications: true,
        });
        const googleEventId = googleResponse.result.id;
        await updateDoc(docRef, { googleEventId: googleEventId });
      }
      console.log("Evento salvo/atualizado com sucesso!");
      setSaving(false);
      onClose();
    } catch (e) {
      console.error("Erro ao salvar evento:", e);
      
      // Lógica de Recuperação Automática para Erro 401 (Token Expirado)
      if (e.result && e.result.error && e.result.error.code === 401) {
         console.log("Token expirado detectado. Limpando credenciais...");
         localStorage.removeItem('gapi_access_token');
         // Opcional: Recarregar a página para forçar novo login limpo
         window.location.reload();
      }
      
      // Não definimos setModalError visível para o usuário
      setSaving(false);
    }
  };
  const handleMusicoToggle = (musicoId) => {
  	// ... (código idêntico)
    setSelectedMusicos(prev =>
      prev.includes(musicoId)
        ? prev.filter(id => id !== musicoId)
        : [...prev, musicoId]
    );
  };
  
  const handleCachetChange = (musicoId, valor) => {
  	// ... (código idêntico)
    setCachets(prev => ({
      ...prev,
      [musicoId]: valor
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="flex justify-between items-center p-6 border-b border-gray-700">
            <h3 className="text-2xl font-bold text-white">
              {/* Título dinâmico */}
              {isEditMode ? 'Editar Evento' : 'Adicionar Novo Evento'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
            	<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          	</button>
        	</div>
			
        	<div className="p-6 space-y-4">
          	{modalError && <ErrorMessage message={modalError} onDismiss={() => setModalError(null)} />}
          	<FormInput
            	label="Nome do Evento"
            	value={nome}
            	onChange={setNome}
            	placeholder="Ex: Casamento Ana e Bruno"
          	/>
          	<FormInput
              label="Endereço / Local"
              value={cidade}
              onChange={setCidade}
              placeholder="Ex: Rua das Flores, 123 - Campinas"
            />
          	<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            	<FormInput
              	label="Data"
              	type="date"
              	value={data}
              	onChange={setData}
            	/>
            	<FormSelect
              	label="Hora Início"
              	value={horaInicio}
  	        	onChange={setHoraInicio}
            	options={timeOptions}
          	/>
          	<FormSelect
            	label="Hora Fim"
            	value={horaFim}
            	onChange={setHoraFim}
            	options={timeOptions}
          	/>
        	</div>
        	<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          	<FormSelect
            	label="Status"
  	        	value={status}
            	onChange={setStatus}
            	options={['A Confirmar', 'Confirmado']}
          	/>
          	<FormSelect
            	label="Pacote"
            	value={pacote}
  	        	onChange={setPacote}
            	options={pacotesOptions}
          	/>
          	<FormInput
            	label="Valor do Evento (R$)"
            	type="text"
            	inputMode="numeric"
            	value={valorEvento}
  	        	onChange={setValorEvento}
            	placeholder="Ex: 1500"
          	/>
        	</div>
        	<div>
            	<label className="block text-sm font-medium text-gray-400 mb-2">
              	Selecionar Músicos (e definir cachet)
            	</label>
            	<div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg p-2 space-y-2">
              	{musicosCadastrados.length === 0 && (
                	<p className="text-gray-400 text-sm">Nenhum músico cadastrado. Vá para a aba "Músicos" para adicionar.</p>
              	)}
              	{musicosCadastrados.map(musico => (
                	<div key={musico.id} className="p-2 hover:bg-gray-700 rounded-lg">
                  	{/*                      * NOVO LAYOUT: justify-between para empurrar o cachet para a direita
                     */}
                  	<div className="flex justify-between items-center">
                    	{/* Checkbox e Nome */}
                    	<label className="flex items-center space-x-3 cursor-pointer">
                      	<input
                          type="checkbox"
                          checked={selectedMusicos.includes(musico.id)}
                          onChange={() => handleMusicoToggle(musico.id)}
                          className="h-5 w-5 rounded text-[#C69874] bg-gray-600 border-gray-500 focus:ring-[#C69874]"
                        />
                      	<span className="text-gray-100">
                        	{musico.nome} <span className="text-gray-400 text-sm">({musico.instrumento})</span>
                      	</span>
                    	</label>

                    	{/* Input de Cachet (agora alinhado à direita) */}
                    	{selectedMusicos.includes(musico.id) && (
                      	<div className="flex items-center pl-2">
                        	<span className="text-sm text-gray-400 mr-1">R$</span>
                        	<input
                          	type="text"
                          	inputMode="numeric"
                          	placeholder="Cachet"
                          	className="w-24 p-1 bg-gray-900 border border-gray-600 rounded-md shadow-sm text-sm text-gray-100"
                          	value={cachets[musico.id] || ''}
                          	onChange={(e) => handleCachetChange(musico.id, e.target.value)}
                        	/>
                      	</div>
                    	)}
                  	</div>
                	</div>
              	))}
            	</div>
          	</div>
      	</div>
<div className="p-6 bg-gray-800 border-t border-gray-700 rounded-b-2xl flex justify-end space-x-3">
          	{/* Botão Cancelar (Estilo Dark) */}
          	<button
            	type="button"
            	onClick={onClose}
            	className="bg-gray-700 hover:bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-lg shadow-sm transition duration-300"
          	>
            	Cancelar
          	</button>
          	{/* Botão Salvar (Estilo Rose Gold) */}
          	<button
            type="submit"
            disabled={saving}
            className="bg-[#C69874] hover:opacity-90 text-black font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 disabled:opacity-50"
          >
            {/* Texto dinâmico */}
            {saving ? 'Salvando...' : (isEditMode ? 'Atualizar Evento' : 'Salvar Evento')}
          </button>
        	</div>
    	</form>
  	</div>
  </div>
  );
};

const MusicosManager = ({ musicos, loading, collectionPath, setError }) => {
  const [musicoParaEditar, setMusicoParaEditar] = useState(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [instrumento, setInstrumento] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (musicoParaEditar) {
      setNome(musicoParaEditar.nome);
      setEmail(musicoParaEditar.email);
      setInstrumento(musicoParaEditar.instrumento);
      setFormError(null);
    } else {
      setNome('');
      setEmail('');
      setInstrumento('');
    }
  }, [musicoParaEditar]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome || !email || !instrumento) {
      setFormError("Por favor, preencha todos os campos.");
      return;
    }
    if (!collectionPath) {
      setError("Erro de conexão (User ID nulo).");
      return;
    }
    setSaving(true);
    setFormError(null);

    // --- AQUI ESTÁ A PROTEÇÃO QUE FALTAVA ---
    const emailLimpo = email.trim().toLowerCase();
    const nomeLimpo = nome.trim();
    // ----------------------------------------

    try {
      if (musicoParaEditar) {
        const musicoRef = doc(db, collectionPath, musicoParaEditar.id);
        await setDoc(musicoRef, {
          nome: nomeLimpo,
          email: emailLimpo, // Usa o e-mail limpo
          instrumento: instrumento,
          });
        setMusicoParaEditar(null);
      } else {
        await addDoc(collection(db, collectionPath), {
          nome: nomeLimpo,
          email: emailLimpo, // Usa o e-mail limpo
          instrumento: instrumento,
        });
        setNome('');
        setEmail('');
        setInstrumento('');
        }
    } catch (e) {
      console.error("[Firestore] Erro ao salvar músico:", e);
      setFormError("Não foi possível salvar o músico.");
    }
    setSaving(false);
  };

  const handleDelete = async (musicoId) => {
    if (!collectionPath) {
      setError("Erro de conexão (User ID nulo).");
      return;
    }
    if (musicoParaEditar && musicoParaEditar.id === musicoId) {
      setMusicoParaEditar(null);
    }
    const result = await Swal.fire({
      title: 'Tem certeza?',
      text: "O músico será removido permanentemente.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#C69874',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sim, deletar!',
      cancelButtonText: 'Cancelar',
      background: '#2A3E4D',
      color: '#F5F0ED'
    });
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, collectionPath, musicoId));
        Swal.fire({
            title: 'Deletado!',
            text: 'Músico removido.',
            icon: 'success',
            confirmButtonColor: '#C69874',
            background: '#2A3E4D',
            color: '#F5F0ED'
        });
      } catch (e) {
        console.error("[Firestore] Erro ao deletar músico:", e);
        setError("Não foi possível deletar o músico.");
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1">
        <div className="bg-[#2A3E4D] rounded-2xl shadow-xl p-6 border border-[#C69874]/20">
          <h3 className="text-2xl font-bold text-[#C69874] mb-6 border-b border-[#C69874]/30 pb-2">
            {musicoParaEditar ? 'Editar Músico' : 'Novo Músico'}
          </h3>
          {formError && <ErrorMessage message={formError} onDismiss={() => setFormError(null)} />}
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormInput
              label="Nome Completo"
              value={nome}
              onChange={setNome}
              placeholder="Ex: João Silva"
              className="text-[#F5F0ED]" 
            />
            <FormInput
              label="Email Google"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="email@gmail.com"
              className="text-[#F5F0ED]"
            />
            <FormInput
              label="Instrumento / Função"
              value={instrumento}
              onChange={setInstrumento}
              placeholder="Ex: Vocal"
              className="text-[#F5F0ED]"
            />
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-[#C69874] hover:bg-[#b08463] text-[#162A3A] font-bold py-3 px-4 rounded-lg shadow-lg transition duration-300 disabled:opacity-50 transform hover:-translate-y-1"
              >
                {saving ? 'Salvando...' : (musicoParaEditar ? 'Atualizar Músico' : 'Salvar Músico')}
              </button>
              {musicoParaEditar && (
                <button
                  type="button"
                  onClick={() => setMusicoParaEditar(null)}
                  className="w-full bg-transparent border border-[#A9B4BD] text-[#A9B4BD] hover:bg-[#162A3A] hover:text-white font-medium py-2 px-4 rounded-lg transition duration-300"
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="bg-[#2A3E4D] rounded-2xl shadow-xl p-6 border border-[#C69874]/20">
          <h3 className="text-2xl font-bold text-[#F5F0ED] mb-6 border-b border-[#C69874]/30 pb-2">
            Músicos Cadastrados
          </h3>
          
          {loading && <p className="text-[#A9B4BD]">Carregando lista...</p>}
          
          {!loading && musicos.length === 0 && (
            <div className="text-center py-8 text-[#A9B4BD]">
               <p>Nenhum músico cadastrado ainda.</p>
               <p className="text-sm mt-2">Use o formulário ao lado para adicionar.</p>
            </div>
          )}
          
          {!loading && musicos.length > 0 && (
            <ul className="space-y-4">
              {musicos.map(musico => (
                <li key={musico.id} className="bg-[#162A3A] p-4 rounded-xl border border-[#374151] flex justify-between items-center gap-3">
                  
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                       <Avatar name={musico.nome || "?"} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold text-[#F5F0ED] truncate">{musico.nome}</p>
                      <p className="text-xs text-[#C69874] font-bold uppercase tracking-wide truncate">{musico.instrumento}</p>
                      <p className="text-sm text-[#A9B4BD] mt-0.5 break-all">{musico.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setMusicoParaEditar(musico)}
                      className="p-2 rounded-full text-[#C69874] hover:bg-[#2A3E4D] transition-colors"
                      title="Editar"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"></path></svg>
                    </button>
                    <button
                      onClick={() => handleDelete(musico.id)}
                      className="p-2 rounded-full text-red-400 hover:bg-[#2A3E4D] hover:text-red-300 transition-colors"
                      title="Excluir"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
// Componente reusável para Input (NOVO ESTILO)
const FormInput = ({ label, type = 'text', value, onChange, placeholder, inputMode = 'text', className = '' }) => (
  <div>
    <label className="block text-sm font-medium text-gray-400 mb-1">
      {label}
    </label>
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full py-2 form-input-dark ${className}`}
    />
  </div>
);
// Componente reusável para Select (NOVO ESTILO)
const FormSelect = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-sm font-medium text-gray-400 mb-1">
      {label}
    </label>
  	<select
    	value={value}
    	onChange={(e) => onChange(e.target.value)}
    	// Usa as novas classes CSS
    	className="w-full py-2 form-select-dark"
  	>
    	{options.map(option => (
      	<option key={option} value={option}>{option}</option>
    	))}
  	</select>
  </div>
);

// Componente reusável para Botão de Aba (NOVO ESTILO)
const TabButton = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`pb-2 px-2 font-medium text-base transition-all duration-200 border-b-2
    	${isActive
      	? 'border-[#C69874] text-[#C69874]'
      	: 'text-[#A9B4BD] border-transparent hover:text-[#F5F0ED]'
    	}
  	`}
  >
    {label}
  </button>
);
// Componente de Erro Silencioso (Apenas loga no console)
const ErrorMessage = ({ message }) => {
  if (message) {
    console.warn("Erro capturado pelo sistema:", message);
  }
  return null; // Não renderiza nada na tela
};
const InfoItem = ({ label, value, children }) => (
  <div>
    <label className="block text-xs font-medium text-[#A9B4BD] uppercase tracking-wide mb-1">
      {label}
    </label>
    {children ? (
      <div className="mt-1">{children}</div>
    ) : (
      <p className="text-base font-semibold text-[#F5F0ED]">
        {value}
      </p>
    )}
  </div>
);

import './App.css';
// Componente Helper (NOVO ESTILO DARK)
const StatusBadge = ({ status }) => (
  <span
    className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap
    	${status === 'Confirmado'
      	? 'bg-[#C69874] text-white'
      	: 'bg-[#162A3A] text-white'
    	}
  	`}
  >
  	{status}
  </span>
);
// ATUALIZAÇÃO: Avatar usa a cor Rose Gold
const Avatar = ({ name }) => {
  const initials = getInitials(name);
  return (
  	<div
    	className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold border-2 border-[#C69874] text-[#C69874] bg-transparent"
  	>
    	{initials}
  	</div>
  );
};

export default App;
