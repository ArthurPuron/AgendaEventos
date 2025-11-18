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

/*
  LEIA ANTES DE RODAR: INSTRUÇÕES DO IMPLEMENTADOR (Passo 36)
  ... (comentários omitidos para brevidade) ...
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
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // --- CASO 1: Usuário ESTÁ logado ---
        console.log("onAuthStateChanged: Usuário encontrado.", user.uid);
        setUserId(user.uid);
        setUserProfile({
          name: user.displayName,
          email: user.email,
          picture: user.photoURL,
        });

        if (user.uid === ADMIN_UID) {
          setUserRole('admin');
          console.log("Status de Acesso: ADMIN");
      	} else {
          setUserRole('musician');
          console.log("Status de Acesso: MÚSICO");
      	}
        
      	setIsDbReady(true);
      	setGlobalError(null);

      } else {
      	// --- CASO 2: Usuário NÃO está logado (ou deslogou) ---
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
      }
      
    	// --- Finalmente: Avisa o App que a verificação terminou ---
    	setAuthLoading(false);
  	});

  	// Função de limpeza do useEffect
  	return () => unsubscribe();
  }, []); // O array vazio [] garante que isso rode SÓ UMA VEZ


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
  	// ... (código idêntico)
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
        })
        .catch((e) => {
          console.error('Erro ao inicializar GAPI client:', e);
          setGlobalError('Erro ao inicializar GAPI client.');
        });
    });
  };

  // --- Funções de Autenticação Google (Idêntico e simplificado) ---
  const handleAuthClick = async () => {
  	// ... (código idêntico)
    if (ADMIN_UID === "COLE_SEU_GOOGLE_UID_AQUI") {
      setGlobalError("Erro de Configuração: O ADMIN_UID ainda não foi definido no código App.jsx.");
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Erro no login com Google:", e);
      setGlobalError(`Erro de autenticação: ${e.message}`);
    }
  };

  const handleCalendarAuth = async () => {
  	// ... (código idêntico)
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(CALENDAR_SCOPE); 
      const result = await signInWithPopup(auth, provider); 
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      if (token) {
        const scriptGapi = document.createElement('script');
        scriptGapi.src = 'https://apis.google.com/js/api.js';
        scriptGapi.async = true;
        scriptGapi.defer = true;
        scriptGapi.onload = () => initializeGapi(token); 
        document.body.appendChild(scriptGapi);
      }
    } catch (e) {
      console.error("Erro ao autorizar calendário:", e);
      setGlobalError("Não foi possível autorizar o Google Calendar.");
    }
  };

  const handleSignoutClick = async () => {
  	// ... (código idêntico)
    try {
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

// --- Componente: Cabeçalho (com Abas) ---
const renderHeader = () => (
    <header className="bg-[#162A3A] shadow-md">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <h1 className="text-2xl font-bold text-[#F5F0ED]">
            Agenda de Músicos
          </h1>
          <div className="flex items-center">
            <span className="text-[#A9B4BD] mr-3 hidden sm:block">
              Olá, {userProfile.name.split(' ')[0]}
          	</span>
            {userProfile.picture ? (
              <img
                className="h-10 w-10 rounded-full"
                src={userProfile.picture}
                alt="Foto do Perfil"
              />
            ) : (
              <Avatar name={userProfile.name} />
            )}
            <button
              onClick={handleSignoutClick}
              className="ml-4 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300"
          	>
              Sair
          	</button>
        	</div>
      	</div>
    	</div>
    	
    	{/* Abas com novo estilo dark */}
    	{userRole === 'admin' && (
      	<nav className="bg-[#162A3A] border-t border-[#2A3E4D]">
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

 // --- NOVO: Tela de Autorização do Admin (Atualizada com a Paleta) ---
  const AdminAuthScreen = () => (
    <div className="bg-[#2A3E4D] rounded-lg shadow-xl p-4 sm:p-8 text-center">
      <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F0ED] mb-4">
        Autorização Necessária
    	</h2>
      <p className="text-[#F5F0ED] mb-6">
        Para gerenciar eventos, você precisa autorizar o acesso ao seu Google Calendar.
    	</p>
      <button
        onClick={handleCalendarAuth}
        className="bg-[#C9A798] hover:opacity-90 text-black font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1"
    	>
        Autorizar Google Calendar
    	</button>
      <p className="text-sm text-[#A9B4BD] mt-4">
        (Os músicos não verão esta etapa.)
    	</p>
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
  	// ... (código idêntico)
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
    // ATUALIZAÇÃO: Removemos o 'div' com 'bg-gray-800', 'rounded-lg', 'shadow-xl', 'p-4', 'sm:p-8'
    // Este 'div' agora é apenas um container lógico, sem fundo ou painel.
    <div>
      <div className="mb-6">
        <button
          onClick={() => setShowAddModal(true)}
          // ATUALIZAÇÃO: Cor de fundo para Rose Gold
          className="w-auto bg-[#C9A798] hover:opacity-90 text-black font-bold py-2 px-6 rounded-lg shadow-lg transition duration-300"
      	>
          + Novo Evento
      	</button>
    	</div>

    	{loadingEventos && <p>Carregando eventos...</p>}
    	{!loadingEventos && eventos.length === 0 && (
      	<p className="text-gray-400">Nenhum evento cadastrado ainda.</p>
    	)}
    	{!loadingEventos && eventos.length > 0 && (
      	// NOVO LAYOUT: Lista de cards em vez de "divide-y"
      	<ul className="space-y-4">
        	{eventos.map(evento => (
          	// Card principal do evento
          	// Card principal do evento


			<li 
            	key={evento.id}
            	// ATUALIZAÇÃO: Fundo do Card para Azul-Sombra
            	className="bg-[#2A3E4D] p-4 rounded-lg shadow-md cursor-pointer"
				onClick={() => setSelectedEvento(evento)}
          	>
            	{/* Seção 1: Informações (Nome, Cidade, Data) */}
            	<div>
              	{/* ATUALIZAÇÃO: Título para Branco-Gelo */}
              	<p className="text-xl font-bold text-[#F5F0ED]">{evento.nome}</p>
              	{/* ATUALIZAÇÃO: Subtítulos para Cinza-Bege */}
              	<p className="text-sm text-[#A9B4BD]">{evento.cidade}</p>
              	<p className="text-sm text-[#A9B4BD] mt-1">
                	{formatDisplayDate(evento.dataInicio, evento.dataFim)}
              	</p>
            	</div>
            	
            	{/* Seção 2: Ações (Status, Editar, Deletar) */}
            	{/* ATUALIZAÇÃO: Borda divisória para Azul Marinho (fundo) */}
            	<div className="flex items-center justify-between mt-4 pt-4 border-t border-[#162A3A]">
              	{/* Status (será atualizado no componente StatusBadge) */}
              	<StatusBadge status={evento.status} />
              	
              	{/* Botões de Ação */}
              	<div className="flex flex-shrink-0 ml-2">
                	<button
                  	onClick={(e) => {
                    	e.stopPropagation(); 
                    	setEventoParaEditar(evento);
                  	}}
                  	// ATUALIZAÇÃO: Ícone para Cinza-Bege, hover para Branco-Gelo
                  	className="text-[#A9B4BD] hover:text-[#F5F0ED] p-2 rounded-full transition duration-300"
                  	title="Editar evento"
                	>
                  	<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"></path></svg>
                	</button>

                	<button
                  	onClick={(e) => {
                    	e.stopPropagation();
        _eventos/ag(evento.id);
                  	}}
                  	// ATUALIZAÇÃO: Ícone para Cinza-Bege
                  	className="text-[#A9B4BD] hover:text-red-500 p-2 ml-2 rounded-full transition duration-300"
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      	{/* ... (código idêntico) ... */}
      	<div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        	<h1 className="text-3xl font-bold text-gray-800 mb-2">
          	Agenda de Músicos
        	</h1>
        	<p className="text-gray-600 mb-8">
          	Faça login com sua conta Google para gerenciar os eventos.
        	</p>
        	{globalError && <ErrorMessage message={globalError} />}
        	<button
          	onClick={handleAuthClick}
          	className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1"
        	>
          	Fazer Login com Google
        	</button>
      	</div>
      </div>
    );
  }

  // Tela Principal (Logado e Autorizado)
  // (Só chega aqui se authLoading = false E userProfile = true)
  return (
<div className="min-h-screen bg-transparent text-[#F5F0ED] font-sans">
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
  const isAdmin = userRole === 'admin';
  // ... (código idêntico)
  const startDate = new Date(evento.dataInicio);
  const endDate = new Date(evento.dataFim);
  const dateString = startDate.toLocaleDateString('pt-BR', { 
    day: '2-digit', month: '2-digit', year: 'numeric' 
  });
  const timeString = `${startDate.toLocaleTimeString('pt-BR', { timeStyle: 'short' })} - ${endDate.toLocaleTimeString('pt-BR', { timeStyle: 'short' })}`;
  const myCachet = evento.musicos.find(m => m.email === userEmail)?.cachet || '0';
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      	{/* ... (código idêntico) ... */}
        <div className="flex justify-between items-start p-6 border-b border-gray-200">
          <div className="flex-grow">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-gray-900">
                {evento.nome}
              </h3>
              <StatusBadge status={evento.status} />
            </div>
            <p className="text-sm text-gray-500">{evento.cidade}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 ml-4"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoItem label="Data" value={dateString} />
            <InfoItem label="Horário" value={timeString} />
            {isAdmin ? (
              <InfoItem label="Pacote" value={evento.pacote} />
            ) : (
              <InfoItem label="Seu Cachet" value={formatCurrency(myCachet)} />
            )}
          </div>
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
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2 border-b pb-1">
              Músicos no Evento
            </h4>
            {evento.musicos && evento.musicos.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {evento.musicos.map(musico => {
                  const isMe = musico.email === userEmail;
                  return (
                    <li key={musico.id} className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">{musico.nome}</p>
                        <p className="text-sm text-gray-500">{musico.instrumento}</p>
                      </div>
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
  	// ... (código idêntico)
    e.preventDefault();
    setModalError(null); 
    if (!nome || !data || !horaInicio || !horaFim || !cidade) {
      setModalError("Por favor, preencha todos os campos obrigatórios."); 
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
          console.warn(`Músico com ID ${musicoId} não encontrado. Será removido do evento.`);
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
          console.log("Atualizando evento existente no Google Calendar...");
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
          console.warn("Evento antigo sem googleEventId. Criando novo evento no Google Calendar...");
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
    	setModalError(errorMessage);
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
                        	className="h-5 w-5 rounded text-[#d4b79b] bg-gray-600 border-gray-500 focus:ring-[#d4b79b]"
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
            	className="bg-[#C9A798] hover:opacity-90 text-black font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 disabled:opacity-50"
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
  // ... (código idêntico)
  const [musicoParaEditar, setMusicoParaEditar] = useState(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [instrumento, setInstrumento] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
  	// ... (código idêntico)
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
  	// ... (código idêntico)
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
    try {
      if (musicoParaEditar) {
        const musicoRef = doc(db, collectionPath, musicoParaEditar.id);
        await setDoc(musicoRef, {
          nome: nome,
          email: email,
        	instrumento: instrumento,
      	});
      	setMusicoParaEditar(null);
    	} else {
      	await addDoc(collection(db, collectionPath), {
        	nome: nome,
        	email: email,
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
  	// ... (código idêntico)
    if (!collectionPath) {
      setError("Erro de conexão (User ID nulo).");
      return;
    }
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
      	await deleteDoc(doc(db, collectionPath, musicoId));
      	Swal.fire('Deletado!','O músico foi removido da sua lista.','success');
    	} catch (e) {
      	console.error("[Firestore] Erro ao deletar músico:", e);
      	setError("Não foi possível deletar o músico.");
      	Swal.fire('Erro!','Não foi possível deletar o músico.','error');
    	}
  	}
  };

  return (
  	<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
    	{/* ... (código idêntico) ... */}
    	<div className="lg:col-span-1">
      	<div className="bg-white rounded-lg shadow-xl p-4 sm:p-6">
        	<h3 className="text-2xl font-bold text-gray-900 mb-4">
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
            	{saving ? 'Salvando...' : (musicoParaEditar ? 'Atualizar Músico' : 'Salvar Músico')}
          	</button>
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
              	<div className="mb-2 sm:mb-0 flex items-center">
                	<Avatar name={musico.nome} />
                	<div className="ml-3">
                  	<p className="text-lg font-medium text-gray-900">{musico.nome}</p>
                  	<p className="text-sm text-gray-600">{musico.instrumento}</p>
  	            	<p className="text-sm text-gray-500">{musico.email}</p>
              	</div>
            	</div>
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

// Componente reusável para Input (NOVO ESTILO)
const FormInput = ({ label, type = 'text', value, onChange, placeholder, inputMode = 'text' }) => (
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
      // Usa a nova classe CSS para o estilo sublinhado
      className="w-full py-2 form-input-dark"
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
    className={`py-3 px-4 font-medium text-sm rounded-t-lg transition-colors duration-200
    	${isActive
      	// ATUALIZAÇÃO: Borda Rose Gold e texto Branco-Gelo
      	? 'border-b-2 border-[#C9A798] text-[#F5F0ED]'
      	// ATUALIZAÇÃO: Texto Cinza-Bege e hover para Branco-Gelo
      	: 'text-[#A9B4BD] hover:text-[#F5F0ED] border-b-2 border-transparent hover:border-gray-600'
    	}
  	`}
  >
    {label}
  </button>
);

const ErrorMessage = ({ message, onDismiss }) => (
  // ... (código idêntico)
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

const InfoItem = ({ label, value, children }) => (
  // ... (código idêntico)
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

import './App.css';
// Componente Helper (NOVO ESTILO DARK)
const StatusBadge = ({ status }) => (
  <span
    className={`px-3 py-1 rounded-full text-xs font-bold
    	${status === 'Confirmado'
      	// ATUALIZAÇÃO: Confirmado usa Rose Gold
      	? 'bg-[#C9A798] text-black'
      	// ATUALIZAÇÃO: A Confirmar usa Azul-Sombra e texto Cinza-Bege
      	: 'bg-[#2A3E4D] text-[#A9B4BD]'
    	}
  	`}
  >
  	{status}
  </span>
);
// ATUALIZAÇÃO: Avatar usa a cor Rose Gold
const Avatar = ({ name }) => {
  const initials = getInitials(name);
  // ATUALIZAÇÃO: Removemos a lógica de cores aleatórias
  // e aplicamos o Rose Gold diretamente.
  const color = 'bg-[#C9A798] text-black'; // Fundo Rose Gold, texto preto

  return (
  	<div
    	className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${color}`}
  	>
    	{initials}
  	</div>
  );
};


export default App;
