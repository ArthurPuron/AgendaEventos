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
  onAuthStateChanged, // <-- A CHAVE PARA O LOGIN PERSISTENTE
} from 'firebase/auth';

/*
  LEIA ANTES DE RODAR: INSTRUÇÕES DO IMPLEMENTADOR (Passo 41)

  Olá, Implementador!

  Identifiquei e corrigi o bug que você descreveu (F5 levando
  a uma tela de autorização "travada").

  O problema era que, ao recarregar com um token salvo (no
  localStorage), o app carregava o GAPI (para usar o token),
  mas esquecia de carregar o GSI (para o botão "Autorizar").

  Se o token estivesse expirado, o GAPI falhava, o app
  mostrava a tela de autorização, mas o botão "Autorizar"
  ficava "Carregando..." para sempre, pois o GSI (tokenClient)
  nunca foi inicializado.

  A CORREÇÃO (Abaixo, no useEffect 3):
  Agora, o app (como admin) SEMPRE carrega o GSI (para
  garantir que o 'tokenClient' do botão "Autorizar" esteja
  pronto) E, em paralelo, se houver um token salvo, ele
  tenta carregar o GAPI.
*/

// **********************************************************
// UID DE ADMIN (Corrigido no Passo 33)
// **********************************************************
const ADMIN_UID = "b2XJT8OqQ7SezDjU3WtWv6MwYVa2";

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

// Chave para o localStorage
const GAPI_TOKEN_KEY = 'gapi_access_token';

// ATENÇÃO: Use o Client ID do Google Cloud, não a API Key do Firebase
// Este é o ID do seu projeto `agenda-musicos-f6f01` no Google Cloud
const GOOGLE_CLIENT_ID_GSI = "1033560928889-uel0855k0v713oqkqf4ktqa2j80burad.apps.googleusercontent.com";

// Inicialização movida para dentro do App
let db, auth;

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

// --- Funções Helper ---
const getLocalTimeZone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

// GERA OS HORÁRIOS DE 30 EM 30 MINUTOS
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

// Lista de Pacotes (Nova)
const pacotesOptions = ['Harmonie', 'Intimist', 'Essence'];

// HELPER: Formata data/hora para exibição (USADO NA LISTA PRINCIPAL)
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

// HELPER: Formata valores monetários
const formatCurrency = (valor) => {
  // Converte string (ex: "1.500,00" ou "1500") para número
  const num = parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// HELPER (EDIÇÃO): Formata ISO (2025-11-26T09:00:00) para YYYY-MM-DD
const formatDateForInput = (isoDate) => {
  if (!isoDate) return '';
  try {
    return isoDate.split('T')[0];
  } catch (e) {
    return '';
  }
};

// HELPER (EDIÇÃO): Constrói o mapa de cachets a partir do array de músicos
const buildCachetsMap = (musicosArray = []) => {
  return musicosArray.reduce((acc, musico) => {
    acc[musico.id] = musico.cachet;
    return acc;
  }, {});
};


function App() {
  // --- Estados do Firebase (AGORA EM ESTADO) ---
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);

  // --- Estados da Autenticação ---
  const [gapiClient, setGapiClient] = useState(null); // Cliente da API (GAPI)
  const [tokenClient, setTokenClient] = useState(null); // NOVO: Cliente GSI Token
  const [isCalendarReady, setIsCalendarReady] = useState(false);
  
  // --- Estados do Usuário ---
  const [userId, setUserId] = useState(null); // ID do usuário
  const [userProfile, setUserProfile] = useState(null); // Perfil
  const [isDbReady, setIsDbReady] = useState(false); // Pronto para carregar dados
  const [userRole, setUserRole] = useState(null); // 'admin', 'musician', ou null

  // --- Estados da Aplicação ---
  const [globalError, setGlobalError] = useState(null); // Erro para o app (fora do modal)
  const [page, setPage] = useState('eventos');
  const [musicos, setMusicos] = useState([]);
  const [loadingMusicos, setLoadingMusicos] = useState(true);
  const [eventos, setEventos] = useState([]);
  const [loadingEventos, setLoadingEventos] = useState(true);
  
  // --- Estados dos Modais (ATUALIZADO) ---
  const [showAddModal, setShowAddModal] = useState(false); // (Era showEventModal)
  const [selectedEvento, setSelectedEvento] = useState(null); // Para Visualização
  const [eventoParaEditar, setEventoParaEditar] = useState(null); // NOVO: Para Edição

  // --- Caminhos das Coleções ---
  const getMusicosCollectionPath = () => {
    if (userRole !== 'admin' || !userId) return null;
    return `users/${userId}/musicos`;
  };
  const getEventosCollectionPath = () => {
    if (userRole !== 'admin' || !userId) return null;
    return `users/${userId}/eventos`;
  };

  // 1. NOVO: Inicialização do Firebase
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      auth = getAuth(app);
      
      setIsFirebaseReady(true); // <--- Corrige 'popup-blocked'
      
      setLogLevel('Debug');
      console.log("Firebase SDKs inicializados.");
    } catch (e) {
      console.error("Erro fatal ao inicializar Firebase:", e);
      setGlobalError("Não foi possível conectar ao banco de dados.");
    }
  }, []); // Roda SÓ UMA VEZ

  // 2. NOVO: Ouvinte de Autenticação (Corrige "deslogar")
  useEffect(() => {
    if (!isFirebaseReady || !auth) return; // Só rode se o Firebase estiver pronto

    // onAuthStateChanged lida com login, logout E persistência
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // --- USUÁRIO ESTÁ LOGADO ---
        console.log('onAuthStateChanged: Usuário detectado', user.uid);
        setUserId(user.uid);
        setUserProfile({
          name: user.displayName,
          email: user.email,
          picture: user.photoURL,
        });
        
        // Define o Papel
        if (user.uid === ADMIN_UID) {
          setUserRole('admin');
          console.log("Status de Acesso: ADMIN");
        } else {
          setUserRole('musician');
          console.log("Status de Acesso: MÚSICO");
        }
        setIsDbReady(true);
        
      } else {
        // --- USUÁRIO ESTÁ DESLOGADO ---
        console.log('onAuthStateChanged: Usuário deslogado');
        setUserId(null);
        setUserProfile(null);
        setIsDbReady(false);
        setUserRole(null);
        setIsCalendarReady(false);
        setGapiClient(null);
        setTokenClient(null); // Limpa cliente GSI
        setGlobalError(null);
        setMusicos([]);
        setEventos([]);
        // Limpa o token da sessão
        localStorage.removeItem(GAPI_TOKEN_KEY);
      }
    });

    return () => unsubscribe(); // Limpa o ouvinte
  }, [isFirebaseReady]); // <-- Depende do Firebase estar pronto


  // 3. NOVO: Carregador de GAPI/GSI (só para Admin) - CORRIGIDO
  useEffect(() => {
    // Roda se o usuário for admin E os scripts ainda não estiverem carregados
    if (userRole === 'admin' && !gapiClient) {
      
      // CORREÇÃO: Carrega o GSI (para o botão "Autorizar")
      // em TODAS as circunstâncias de admin.
      console.log("Admin logado. Carregando GSI para o TokenClient...");
      loadGsiScript(); 
      
      // Agora, verifica se já temos um token salvo para TENTAR
      // pular a tela de autorização.
      const storedToken = localStorage.getItem(GAPI_TOKEN_KEY);
      
      if (storedToken) {
        console.log("Token GAPI encontrado no localStorage. Tentando usar...");
        loadGapiScripts(storedToken, true); // Tenta carregar com o token salvo
      } else {
        console.log("Nenhum token GAPI salvo. GAPI não será carregado até a autorização.");
        // Não precisa fazer nada, o GSI já está carregando.
      }
    }
  }, [userRole, gapiClient]); // Depende do role e do gapiClient
  
  
  // 4. Carregamento de Músicos (Ouvinte do Firestore)
  useEffect(() => {
    const collectionPath = getMusicosCollectionPath();
    if (!isDbReady || !collectionPath || userRole !== 'admin' || !isCalendarReady) {
      setMusicos([]);
      setLoadingMusicos(false);
      return;
    };
    
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

  // 5. Carregamento de Eventos (Ouvinte do Firestore)
  useEffect(() => {
    if (!isDbReady || !userProfile || !userRole) {
      setEventos([]);
      setLoadingEventos(false);
      return;
    };
    
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

  // --- Funções de Inicialização GAPI/GSI (NOVAS) ---
  
  // Carrega GAPI (para usar o Calendar)
  const loadGapiScripts = (accessToken, useToken) => {
    const scriptGapi = document.createElement('script');
    scriptGapi.src = 'https://apis.google.com/js/api.js';
    scriptGapi.async = true;
    scriptGapi.defer = true;
    scriptGapi.onload = () => initializeGapi(accessToken, useToken);
    document.body.appendChild(scriptGapi);
  };
  
  // Carrega GSI (para pedir o token)
  const loadGsiScript = () => {
    const scriptGsi = document.createElement('script');
    scriptGsi.src = 'https://accounts.google.com/gsi/client';
    scriptGsi.async = true;
    scriptGsi.defer = true;
    scriptGsi.onload = initializeGsi;
    document.body.appendChild(scriptGsi);
  };

  const initializeGapi = (accessToken, useToken) => {
    // Adiciona uma verificação para `window.gapi`
    if (typeof window.gapi === 'undefined') {
      console.error("GAPI script não carregou a tempo.");
      setGlobalError("Não foi possível carregar a API do Google.");
      return;
    }

    window.gapi.load('client', () => {
      window.gapi.client
        .init({
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
          ],
        })
        .then(() => {
          if (useToken) {
            window.gapi.client.setToken({ access_token: accessToken });
            console.log("GAPI client inicializado COM token (localStorage).");
          } else {
             console.log("GAPI client inicializado SEM token.");
          }
          setGapiClient(window.gapi);
          // Se usamos o token, o calendário está pronto!
          if(useToken) setIsCalendarReady(true);
        })
        .catch((e) => {
          console.error('Erro ao inicializar GAPI client (provavelmente token expirado):', e);
          // Se o token falhar, limpa ele
          localStorage.removeItem(GAPI_TOKEN_KEY);
          setIsCalendarReady(false); // FORÇA A TELA DE AUTORIZAÇÃO
        });
    });
  };
  
  const initializeGsi = () => {
    if (!auth.currentUser || typeof window.google === 'undefined') {
      console.warn("GSI script carregou, mas usuário deslogou ou 'google' não está no window.");
      // Tenta de novo se o auth.currentUser ainda não estiver pronto
      if (typeof window.google === 'undefined') {
        setTimeout(initializeGsi, 500); // Tenta de novo
      }
      return;
    }
    
    // **********************************
    // A CORREÇÃO (Passo 39)
    // O erro `invalid_client` (401) foi causado por eu
    // ter usado `firebaseConfig.apiKey` aqui.
    // O correto é usar o Client ID OAuth 2.0
    // do Google Cloud (o mesmo que você usou no início).
    // **********************************
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID_GSI, // <-- Corrigido
        scope: CALENDAR_SCOPE,
        login_hint: auth.currentUser.email,
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            const token = tokenResponse.access_token;
            // Salva o token para persistência!
            localStorage.setItem(GAPI_TOKEN_KEY, token);
            // Carrega o GAPI (agora que temos o token)
            loadGapiScripts(token, true);
          }
        },
        error_callback: (error) => {
          console.error('Erro de autorização GSI:', error);
          setGlobalError("Não foi possível autorizar o Google Calendar.");
        }
      });
      console.log("Cliente GSI (TokenClient) inicializado com sucesso.");
      setTokenClient(client);
    } catch (e) {
      console.error("Erro ao inicializar GSI token client:", e);
      setGlobalError("Falha ao inicializar cliente de autorização.");
    }
  };

  // --- Funções de Autenticação Google ---
  
  // Login BÁSICO (sem scope)
  const handleAuthClick = async () => {
    if (ADMIN_UID === "COLE_SEU_GOOGLE_UID_AQUI") {
      setGlobalError("Erro de Configuração: O ADMIN_UID ainda não foi definido no código App.jsx.");
      return;
    }
    if (!isFirebaseReady || !auth) {
      setGlobalError('Firebase Auth não está pronto.');
      return;
    }
    
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // O `onAuthStateChanged` vai pegar o resultado.
    } catch (e) {
      console.error("Erro no login com Google:", e);
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/popup-blocked') {
        setGlobalError(`Erro de autenticação: ${e.message}`);
      }
    }
  };

  // Autorização SÓ PARA ADMIN (usando GSI)
  const handleCalendarAuth = () => {
    if (tokenClient) {
      // Pede o token (força o popup)
      tokenClient.requestAccessToken();
    } else {
      setGlobalError("Cliente de autorização não está pronto. Tente novamente.");
      // Tenta carregar o GSI de novo
      loadGsiScript();
    }
  };


  const handleSignoutClick = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      // O `onAuthStateChanged` vai limpar tudo
    } catch (e) {
      console.error("Erro ao deslogar:", e);
      setGlobalError("Erro ao tentar sair.");
    }
  };
  
  // Deletar Evento (com SweetAlert2)
  const handleDeleteEvento = async (eventoId) => {
    if (userRole !== 'admin') return;
    
    const collectionPath = getEventosCollectionPath();
    if (!collectionPath || !db) {
      setGlobalError("Erro de conexão (User ID nulo ou DB não pronto).");
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
        Swal.fire(
          'Deletado!',
          'O evento foi removido da sua lista.',
          'success'
        );
      } catch (e) {
        console.error("[Firestore] Erro ao deletar evento:", e);
        setGlobalError("Não foi possível deletar o evento do Firestore.");
        Swal.fire(
          'Erro!',
          'Não foi possível deletar o evento.',
          'error'
        );
      }
    }
  };

  // --- Componente: Cabeçalho (com Abas) ---
  const renderHeader = () => (
    <header className="bg-white shadow-md">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <h1 className="text-2xl font-bold text-gray-800">
            Agenda de Músicos
          </h1>
          <div className="flex items-center">
            <span className="text-gray-700 mr-3 hidden sm:block">
              Olá, {userProfile.name.split(' ')[0]}
            </span>
            <img
              className="h-10 w-10 rounded-full"
              src={userProfile.picture}
              alt="Foto do Perfil"
            />
            <button
              onClick={handleSignoutClick}
              className="ml-4 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
      
      {userRole === 'admin' && (
        <nav className="bg-gray-50 border-t border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8 flex space-x-4">
            <TabButton
              label="Eventos"
              isActive={page === 'eventos'}
              onClick={() => setPage('eventos')}
            />
            <TabButton
              label="Músicos"
              isActive={page === 'musicos'}
              onClick={() => setPage('musicos')}
            />
          </div>
        </nav>
      )}
    </header>
  );

  // --- NOVO: Tela de Autorização do Admin ---
  const AdminAuthScreen = () => (
    <div className="bg-white rounded-lg shadow-xl p-4 sm:p-8 text-center">
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
        Autorização Necessária
      </h2>
      <p className="text-gray-700 mb-6">
        Para gerenciar eventos, você precisa autorizar o acesso ao seu Google Calendar.
      </p>
      <button
        onClick={handleCalendarAuth}
        // Desabilita o botão até o GSI estar pronto
        disabled={!tokenClient}
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50"
      >
        {tokenClient ? 'Autorizar Google Calendar' : 'Carregando...'}
      </button>
      {/* ATUALIZADO (Passo 39): Texto removido */}
    </div>
  );

  // --- NOVO: Dashboard do Admin ---
  const AdminDashboard = () => (
    <>
      {page === 'eventos' && renderEventosPage()}
      {page === 'musicos' && renderMusicosPage()}
    </>
  );

  // --- NOVO: Dashboard do Músico ---
  const MusicianDashboard = () => (
    <div className="bg-white rounded-lg shadow-xl p-4 sm:p-8">
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
        Meus Próximos Eventos
      </h2>
      
      {loadingEventos && <p>Carregando seus eventos...</p>}
      {!loadingEventos && eventos.length === 0 && (
        <p className="text-gray-600">Você ainda não foi convidado para nenhum evento.</p>
      )}
      {!loadingEventos && eventos.length > 0 && (
        <ul className="divide-y divide-gray-200">
          {eventos.map(evento => (
            <li key={evento.id}>
              <div
                className="py-4 flex justify-between items-center w-full text-left hover:bg-gray-50 rounded-lg cursor-pointer"
                onClick={() => setSelectedEvento(evento)}
              >
                <div>
                  <p className="text-lg font-medium text-gray-900">{evento.nome}</p>
                  <p className="text-sm text-gray-600">{evento.cidade} - <StatusBadge status={evento.status} /></p>
                  <p className="text-sm text-gray-500">
                    {formatDisplayDate(evento.dataInicio, evento.dataFim)}
                  </p>
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
    <div className="bg-white rounded-lg shadow-xl p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-0">
          Eventos
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1"
        >
          [+] Novo Evento
        </button>
      </div>

      {loadingEventos && <p>Carregando eventos...</p>}
      {!loadingEventos && eventos.length === 0 && (
        <p className="text-gray-600">Nenhum evento cadastrado ainda.</p>
      )}
      {!loadingEventos && eventos.length > 0 && (
        <ul className="divide-y divide-gray-200">
          {eventos.map(evento => (
            <li key={evento.id}>
              <div
                className="py-4 flex justify-between items-center w-full text-left hover:bg-gray-50 rounded-lg cursor-pointer"
                onClick={() => setSelectedEvento(evento)}
              >
                {/* Informações do Evento */}
                <div>
                  <p className="text-lg font-medium text-gray-900">{evento.nome}</p>
                  <p className="text-sm text-gray-600">{evento.cidade} - <StatusBadge status={evento.status} /></p>
                  <p className="text-sm text-gray-500">
                    {formatDisplayDate(evento.dataInicio, evento.dataFim)}
                  </p>
                </div>
                
                {/* Container para os botões de ação */}
                <div className="flex flex-shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEventoParaEditar(evento);
                    }}
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 p-2 rounded-full text-sm transition duration-300"
                    title="Editar evento"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"></path></svg>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEvento(evento.id);
                    }}
                    className="bg-red-100 hover:bg-red-200 text-red-700 p-2 ml-2 rounded-full text-sm transition duration-300"
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

  // --- Componente: Aba de Músicos (ADMIN) ---
  const renderMusicosPage = () => (
    <MusicosManager
      musicos={musicos}
      loading={loadingMusicos}
      collectionPath={getMusicosCollectionPath()}
      setError={setGlobalError}
      db={db} // <-- Passa o db
    />
  );


  // --- Renderização Principal ---

  // Tela de Loading (Enquanto O FIREBASE não está pronto)
  if (!isFirebaseReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">
          Conectando...
        </div>
      </div>
    );
  }

  // Tela de Login (Se o Firebase não tiver usuário)
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Agenda de Músicos
          </h1>
          <p className="text-gray-600 mb-8">
            Faça login com sua conta Google para gerenciar os eventos.
          </p>
          {globalError && <ErrorMessage message={globalError} />}
          {/* ATUALIZAÇÃO (Passo 37): Botão desabilitado */}
          <button
            onClick={handleAuthClick}
            disabled={!isFirebaseReady}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-wait"
          >
            {isFirebaseReady ? 'Fazer Login com Google' : 'Carregando...'}
          </button>
        </div>
      </div>
    );
  }

  // Tela Principal (Logado e Autorizado)
  return (
    // Código de layout limpo (sem hacks w-full)
    <div className="min-h-screen bg-gray-100 font-sans">
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
          db={db} // <-- Passa o db
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

// **********************************************************
// ATUALIZAÇÃO (Passo 34/35) - Componente Inteiro Atualizado
// **********************************************************
const ViewEventModal = ({ evento, onClose, userRole, userEmail }) => {
  const isAdmin = userRole === 'admin';

  // --- Novos Helpers de Layout (para o Pedido 2) ---
  const startDate = new Date(evento.dataInicio);
  const endDate = new Date(evento.dataFim);
  // Helper 1: Data
  const dateString = startDate.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  // Helper 2: Horário
  const timeString = `${startDate.toLocaleTimeString('pt-BR', { timeStyle: 'short' })} - ${endDate.toLocaleTimeString('pt-BR', { timeStyle: 'short' })}`;
  
  // Encontra o cachet do músico logado
  const myCachet = evento.musicos.find(m => m.email === userEmail)?.cachet || '0';
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Cabeçalho do Modal (Layout Corrigido) */}
        <div className="flex justify-between items-start p-6 border-b border-gray-200">
          {/* Div Flex-grow para empurrar o status para a direita */}
          <div className="flex-grow">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-gray-900">
                {evento.nome}
              </h3>
              {/* Status movido para o cabeçalho */}
              <StatusBadge status={evento.status} />
            </div>
            <p className="text-sm text-gray-500">{evento.cidade}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 ml-4" // ml-4 para espaçamento
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-6">
          
          {/* Seção 1: Detalhes Principais (Layout Corrigido) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoItem label="Data" value={dateString} />
            <InfoItem label="Horário" value={timeString} />
            
            {/* Coluna 3 inteligente */}
            {isAdmin ? (
              <InfoItem label="Pacote" value={evento.pacote} />
            ) : (
              <InfoItem label="Seu Cachet" value={formatCurrency(myCachet)} />
            )}
          </div>

          {/* Seção 2: Finanças (SÓ PARA ADMIN) */}
          {isAdmin && (
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-2 border-b pb-1">
                Financeiro (Admin)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem label="Valor Total do Evento" value={formatCurrency(evento.valorEvento)} />
              </div>
            </div>
          )}
          
          {/* Seção 3: Músicos (Lógica Corrigida) */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2 border-b pb-1">
              Músicos no Evento
            </h4>
            {evento.musicos && evento.musicos.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {evento.musicos.map(musico => {
                  // Lógica de Privacidade: Músico só vê o próprio cachet
                  const isMe = musico.email === userEmail;
                  
                  return (
                    <li key={musico.id} className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">{musico.nome}</p>
                        <p className="text-sm text-gray-500">{musico.instrumento}</p>
                      </div>
                      
                      {/* (Correção - Passo 35) */}
                      {isAdmin && (
                        <p className="text-gray-700 font-semibold">
                          {formatCurrency(musico.cachet)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-gray-500">Nenhum músico selecionado para este evento.</p>
            )}
          </div>

        </div>

        {/* Rodapé do Modal */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};


// Modal de Adicionar Evento (AGORA SERVE PARA ADICIONAR E EDITAR)
const AddEventModal = ({ onClose, musicosCadastrados, gapiClient, eventosCollectionPath, db, eventoParaEditar }) => {
  
  const isEditMode = eventoParaEditar !== null;

  // Estados do Evento (Preenchidos se for Edição)
  const [nome, setNome] = useState(isEditMode ? eventoParaEditar.nome : '');
  const [data, setData] = useState(isEditMode ? formatDateForInput(eventoParaEditar.dataInicio) : '');
  const [horaInicio, setHoraInicio] = useState(isEditMode ? eventoParaEditar.dataInicio.split('T')[1].substring(0, 5) : '09:00');
  const [horaFim, setHoraFim] = useState(isEditMode ? eventoParaEditar.dataFim.split('T')[1].substring(0, 5) : '10:00');
  const [cidade, setCidade] = useState(isEditMode ? eventoParaEditar.cidade : '');
  const [status, setStatus] = useState(isEditMode ? eventoParaEditar.status : 'A Confirmar');
  
  // Estados de Finanças (Preenchidos se for Edição)
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
      setModalError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    if (!db) { // Checa o db do prop
      setModalError("Conexão com banco de dados perdida.");
      return;
    }
    setSaving(true);

    try {
      // 1. Prepara dados comuns
      const dataInicioISO = `${data}T${horaInicio}:00`;
      const dataFimISO = `${data}T${horaFim}:00`;
      const fusoHorario = getLocalTimeZone();

      // 2. Prepara lista de músicos com cachets (para Firestore)
      // (Correção do 'vt.id' - Passo 27)
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
          console.warn(`Músico com ID ${musicoId} não encontrado. Será removido do evento.`);
          return null;
        })
        .filter(Boolean); // Remove nulos


      // 3. Objeto para o FIRESTORE (Com todos os dados financeiros)
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
        musicoEmails: musicosConvidados.map(m => m.email), // NOVO: Campo de busca
      };
      
      // 4. Objeto para o GOOGLE CALENDAR (Limpo, sem finanças)
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
      
      // 5. LÓGICA DE SALVAR (CRIAR vs EDITAR)
      if (isEditMode) {
        // --- MODO DE ATUALIZAÇÃO ---
        const eventoRef = doc(db, eventosCollectionPath, eventoParaEditar.id); // Usa o `db` do prop
        
        // (Correção de Edição - Passo 26)
        if (eventoParaEditar.googleEventId) {
          // CASO 1: Evento MODERNO (Tem ID do Google)
          console.log("Atualizando evento existente no Google Calendar...");
          await gapiClient.client.calendar.events.update({
            calendarId: 'primary',
            eventId: eventoParaEditar.googleEventId,
            resource: eventoParaGoogle,
            sendUpdates: 'all' // NOVO: Força notificação de e-mail
          });
          
          // Atualiza Firestore
          await setDoc(eventoRef, {
            ...eventoParaFirestore,
            googleEventId: eventoParaEditar.googleEventId // Preserva o ID
          });
          
        } else {
          // CASO 2: Evento ANTIGO (Sem ID do Google)
          console.warn("Evento antigo sem googleEventId. Criando novo evento no Google Calendar...");
          
          // 1. Cria no Google Calendar
          const googleResponse = await gapiClient.client.calendar.events.insert({
            calendarId: 'primary',
            resource: eventoParaGoogle,
            sendNotifications: true,
          });
          const newGoogleEventId = googleResponse.result.id;

          // 2. Atualiza Firestore com o novo ID
          await setDoc(eventoRef, {
            ...eventoParaFirestore,
            googleEventId: newGoogleEventId // Salva o novo ID
          });
        }
        
      } else {
        // --- MODO DE CRIAÇÃO ---
        
        // 1. Cria no Firestore PRIMEIRO (para ter o ID)
        const docRef = await addDoc(collection(db, eventosCollectionPath), eventoParaFirestore); // Usa o `db` do prop
        
        // 2. Cria no Google Calendar
        const googleResponse = await gapiClient.client.calendar.events.insert({
          calendarId: 'primary',
          resource: eventoParaGoogle,
          sendNotifications: true,
        });
        const googleEventId = googleResponse.result.id;

        // 3. Atualiza o Firestore com o ID do Google
        await updateDoc(docRef, { googleEventId: googleEventId });
      }

      console.log("Evento salvo/atualizado com sucesso!");
      setSaving(false);
      onClose();

    } catch (e) {
      console.error("Erro ao salvar evento (objeto bruto):", e);
      let errorMessage = "Ocorreu um erro desconhecido ao salvar.";

      if (e.result && e.result.error) {
        errorMessage = `Erro do Google (${e.result.error.code}): ${e.result.error.message}`;
        if (e.result.error.code === 403) {
            errorMessage += " - Verifique se a 'Google Calendar API' está ATIVADA no seu projeto do Google Cloud.";
        }
      } else if (e.message) {
        errorMessage = e.message;
      }
      
      setModalError(errorMessage); // Seta o erro local
      setSaving(false);
    }
  };

  const handleMusicoToggle = (musicoId) => {
    // Adiciona ou remove o músico do array de selecionados
    setSelectedMusicos(prev =>
      prev.includes(musicoId)
        ? prev.filter(id => id !== musicoId)
        : [...prev, musicoId]
    );
  };
  
  const handleCachetChange = (musicoId, valor) => {
    // Atualiza o valor do cachet no objeto `cachets`
    setCachets(prev => ({
      ...prev,
      [musicoId]: valor
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="flex justify-between items-center p-6 border-b border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900">
              {/* Título dinâmico */}
              {isEditMode ? 'Editar Evento' : 'Adicionar Novo Evento'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
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
              label="Cidade"
              value={cidade}
              onChange={setCidade}
              placeholder="Ex: São Paulo, SP"
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
            
            {/* --- SEÇÃO DE FINANÇAS (NOVOS CAMPOS) --- */}
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
                type="text" // Usamos text para permitir "1.500,00"
                inputMode="numeric" // Melhora teclado no celular
                value={valorEvento}
                onChange={setValorEvento}
                placeholder="Ex: 1500"
              />
            </div>
            {/* --- FIM DA SEÇÃO DE FINANÇAS --- */}


            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selecionar Músicos (e definir cachet)
              </label>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-2">
                {musicosCadastrados.length === 0 && (
                  <p className="text-gray-500 text-sm">Nenhum músico cadastrado. Vá para a aba "Músicos" para adicionar.</p>
                )}
                {musicosCadastrados.map(musico => (
                  <div key={musico.id} className="p-2 hover:bg-gray-50 rounded-lg">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedMusicos.includes(musico.id)}
                        onChange={() => handleMusicoToggle(musico.id)}
                        className="h-5 w-5 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-gray-800">
                        {musico.nome} <span className="text-gray-500 text-sm">({musico.instrumento})</span>
                      </span>

                      {/* NOVO: Input de Cachet (aparece se selecionado) */}
                      {selectedMusicos.includes(musico.id) && (
                        <div className="ml-auto flex items-center pl-2">
                          <span className="text-sm text-gray-600 mr-1">R$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Cachet"
                            className="w-24 p-1 border border-gray-300 rounded-md shadow-sm text-sm"
                            value={cachets[musico.id] || ''}
                            onChange={(e) => handleCachetChange(musico.id, e.target.value)}
                            // Impede que clicar no input desmarque o músico
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="bg-white hover:bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg border border-gray-300 shadow-sm transition duration-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 disabled:opacity-50"
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


// **********************************************************
// ATUALIZAÇÃO (Passo 28) - Componente Inteiro Atualizado
// **********************************************************
const MusicosManager = ({ musicos, loading, collectionPath, setError, db }) => { // <-- Aceita `db`
  // NOVO: Estado para controlar a edição
  const [musicoParaEditar, setMusicoParaEditar] = useState(null);
  
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [instrumento, setInstrumento] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null); // Erro local do formulário

  // NOVO: Efeito para preencher/limpar o formulário
  useEffect(() => {
    if (musicoParaEditar) {
      // Preenche o formulário para edição
      setNome(musicoParaEditar.nome);
      setEmail(musicoParaEditar.email);
      setInstrumento(musicoParaEditar.instrumento);
      setFormError(null); // Limpa erros
    } else {
      // Limpa o formulário (modo de adição)
      setNome('');
      setEmail('');
      setInstrumento('');
    }
  }, [musicoParaEditar]); // Roda sempre que o 'musicoParaEditar' mudar

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome || !email || !instrumento) {
      setFormError("Por favor, preencha todos os campos.");
      return;
    }
    if (!collectionPath || !db) { // Checa o `db` do prop
      setError("Erro de conexão (User ID nulo ou DB não pronto).");
      return;
    }
    setSaving(true);
    setFormError(null);
    
    try {
      if (musicoParaEditar) {
        // --- MODO DE ATUALIZAÇÃO ---
        const musicoRef = doc(db, collectionPath, musicoParaEditar.id); // Usa o `db` do prop
        await setDoc(musicoRef, {
          nome: nome,
          email: email,
          instrumento: instrumento,
        });
        // Limpa o formulário e sai do modo de edição
        setMusicoParaEditar(null);
      } else {
        // --- MODO DE CRIAÇÃO ---
        await addDoc(collection(db, collectionPath), { // Usa o `db` do prop
          nome: nome,
          email: email,
          instrumento: instrumento,
        });
        // Limpa o formulário
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

  // Deletar Músico (com SweetAlert2)
  const handleDelete = async (musicoId) => {
    if (!collectionPath || !db) { // Checa o `db` do prop
      setError("Erro de conexão (User ID nulo ou DB não pronto).");
      return;
    }
    
    // Se estiver editando este músico, cancele a edição
    if (musicoParaEditar && musicoParaEditar.id === musicoId) {
      setMusicoParaEditar(null);
    }
    
    const result = await Swal.fire({
      title: 'Tem certeza que deseja deletar?',
      text: "O músico será removido permanentemente.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sim, deletar!',
      cancelButtonText: 'Cancelar'
    });
    
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, collectionPath, musicoId)); // Usa o `db` do prop
        Swal.fire(
          'Deletado!',
          'O músico foi removido da sua lista.',
          'success'
        );
      } catch (e) {
        console.error("[Firestore] Erro ao deletar músico:", e);
        setError("Não foi possível deletar o músico."); // Mostra erro global
        Swal.fire(
          'Erro!',
          'Não foi possível deletar o músico.',
          'error'
        );
      }
    }
  };

  return (
    // ATUALIZADO: Layout responsivo para o gerenciador de músicos
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Coluna 1: Formulário (com padding menor no celular) */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            {/* Título dinâmico */}
            {musicoParaEditar ? 'Editar Músico' : 'Adicionar Músico'}
          </h3>
          {formError && <ErrorMessage message={formError} onDismiss={() => setFormError(null)} />}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormInput
              label="Nome"
              value={nome}
              onChange={setNome}
              placeholder="Ex: João Silva"
            />
            <FormInput
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="joao.silva@gmail.com"
            />
            <FormInput
              label="Instrumento"
              value={instrumento}
              onChange={setInstrumento}
              placeholder="Ex: Guitarra, Vocal"
            />
            <div className="flex flex-col sm:flex-row sm:gap-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 disabled:opacity-50"
              >
                {/* Texto dinâmico */}
                {saving ? 'Salvando...' : (musicoParaEditar ? 'Atualizar Músico' : 'Salvar Músico')}
              </button>
              
              {/* NOVO: Botão Cancelar */}
              {musicoParaEditar && (
                <button
                  type="button"
                  onClick={() => setMusicoParaEditar(null)}
                  className="w-full sm:w-auto bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 mt-2 sm:mt-0"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Coluna 2: Lista (com padding menor no celular) */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Músicos Cadastrados
          </h3>
          {loading && <p>Carregando músicos...</p>}
          {!loading && musicos.length === 0 && (
            <p className="text-gray-600">Nenhum músico cadastrado ainda.</p>
          )}
          {!loading && musicos.length > 0 && (
            <ul className="divide-y divide-gray-200">
              {musicos.map(musico => (
                <li key={musico.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                  
                  {/* (Passo 36) Avatar adicionado */}
                  <div className="mb-2 sm:mb-0 flex items-center">
                    <Avatar name={musico.nome} />
                    <div className="ml-3">
                      <p className="text-lg font-medium text-gray-900">{musico.nome}</p>
                      <p className="text-sm text-gray-600">{musico.instrumento}</p>
                      <p className="text-sm text-gray-500">{musico.email}</p>
                    </div>
                  </div>
                  
                  {/* NOVO: Container de botões de ícone */}
                  <div className="flex flex-shrink-0 ml-2 w-full sm:w-auto">
                    <button
                      onClick={() => setMusicoParaEditar(musico)}
                      className="w-1/2 sm:w-auto bg-blue-100 hover:bg-blue-200 text-blue-700 p-2 rounded-lg text-sm transition duration-300"
                      title="Editar Músico"
                    >
                      <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"></path></svg>
                    </button>
                    <button
                      onClick={() => handleDelete(musico.id)}
                      className="w-1/2 sm:w-auto bg-red-100 hover:bg-red-200 text-red-700 p-2 ml-2 rounded-lg text-sm transition duration-300"
                      title="Deletar Músico"
                    >
                      <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
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


// Componente reusável para Input (Idêntico)
const FormInput = ({ label, type = 'text', value, onChange, placeholder, inputMode = 'text' }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <input
      type={type}
      inputMode={inputMode} // Adicionado para teclado numérico
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

// Componente reusável para Select (Idêntico)
const FormSelect = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
    >
      {options.map(option => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </div>
);

// Componente reusável para Botão de Aba (Idêntico)
const TabButton = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`py-3 px-4 font-medium text-sm rounded-t-lg transition-colors duration-200
      ${isActive
        ? 'bg-white border-b-2 border-blue-600 text-blue-600'
        // Correção de bug visual: Corrigido o hover da aba inativa
        : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300'
      }
    `}
  >
    {label}
  </button>
);

// Componente reusável para Mensagem de Erro (Idêntico)
const ErrorMessage = ({ message, onDismiss }) => (
  <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-lg flex justify-between items-center">
    <div>
      <p className="font-bold">Erro</p>
      <p>{message}</p>
    </div>
    {onDismiss && (
      <button onClick={onDismiss} className="text-red-700 font-bold ml-4">
        &times;
      </button>
    )}
  </div>
);

// Componente Helper para o Modal de Visualização
const InfoItem = ({ label, value, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-500">
      {label}
    </label>
    {children ? (
      <div className="mt-1">{children}</div>
    ) : (
      <p className="text-lg font-semibold text-gray-900">
        {value}
      </p>
    )}
  </div>
);

// Componente Helper para o Modal de Visualização
const StatusBadge = ({ status }) => (
  <span
    className={`px-2 py-0.5 rounded-full text-xs font-semibold
      ${status === 'Confirmado'
        ? 'bg-green-100 text-green-800'
        : 'bg-yellow-100 text-yellow-800'
      }
    `}
  >
    {status}
  </span>
);

// (Passo 36): Componente Avatar
const getInitials = (name = '') => {
  const names = name.split(' ').filter(Boolean); // Filtra espaços extras
  if (names.length === 0) return '?';
  // Pega a primeira letra do primeiro nome
  const first = names[0][0];
  // Pega a primeira letra do último nome (se houver mais de 1 nome)
  const last = names.length > 1 ? names[names.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
};

// Gera uma cor consistente baseada no nome
const Avatar = ({ name }) => {
  const initials = getInitials(name);
  const colors = [
    'bg-red-200 text-red-800',
    'bg-blue-200 text-blue-800',
    'bg-green-200 text-green-800',
    'bg-yellow-200 text-yellow-800',
    'bg-purple-200 text-purple-800',
    'bg-pink-200 text-pink-800',
    'bg-indigo-200 text-indigo-800',
  ];
  // Cria um hash simples para pegar uma cor consistente
  const charCodeSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = colors[charCodeSum % colors.length];

  return (
    <div
      className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${color}`}
    >
      {initials}
    </div>
  );
};


export default App;
