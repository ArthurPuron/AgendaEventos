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
  setDoc, // NOVO: Importado para Edição
  updateDoc, // NOVO: Importado para Edição
  setLogLevel,
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

/*
  LEIA ANTES DE RODAR: INSTRUÇÕES DO IMPLEMENTADOR (Passo 25)

  Olá, Implementador!

  Implementei o "Editar Evento". Esta foi uma grande atualização.

  ATUALIZAÇÃO:
  - Adicionado ícone de Lápis na lista de eventos.
  - Adicionado estado `eventoParaEditar` para controlar o modal.
  - O `AddEventModal` agora funciona para CRIAR ou EDITAR.
  - O modal se preenche sozinho ao editar.
  - `handleSubmit` agora tem lógica dupla:
    1. (CRIAR): Salva no Firestore, Salva no Google, Salva o ID do Google de volta no Firestore.
    2. (EDITAR): Atualiza o Firestore, Atualiza o Google Calendar.
*/

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

// NOVO HELPER: Formata data/hora para exibição
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

// NOVO HELPER: Formata valores monetários
const formatCurrency = (valor) => {
  // Converte string (ex: "1.500,00" ou "1500") para número
  const num = parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// NOVO HELPER (EDIÇÃO): Formata ISO (2025-11-26T09:00:00) para YYYY-MM-DD
const formatDateForInput = (isoDate) => {
  if (!isoDate) return '';
  try {
    return isoDate.split('T')[0];
  } catch (e) {
    return '';
  }
};

// NOVO HELPER (EDIÇÃO): Constrói o mapa de cachets a partir do array de músicos
const buildCachetsMap = (musicosArray = []) => {
  return musicosArray.reduce((acc, musico) => {
    acc[musico.id] = musico.cachet;
    return acc;
  }, {});
};


function App() {
  // --- Estados da Autenticação ---
  const [gapiClient, setGapiClient] = useState(null); // Cliente da API (GAPI)
  
  // --- Estados do Firebase ---
  const [userId, setUserId] = useState(null); // ID do usuário
  const [userProfile, setUserProfile] = useState(null); // Perfil
  const [isDbReady, setIsDbReady] = useState(false); // Pronto para Firebase

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
    if (!userId) return null;
    return `users/${userId}/musicos`;
  };
  const getEventosCollectionPath = () => {
    if (!userId) return null;
    return `users/${userId}/eventos`;
  };

  // 1. Carregamento SOMENTE do GAPI (Google API)
  useEffect(() => {
    const scriptGapi = document.createElement('script');
    scriptGapi.src = 'https://apis.google.com/js/api.js';
    scriptGapi.async = true;
    scriptGapi.defer = true;
    scriptGapi.onload = initializeGapi;
    document.body.appendChild(scriptGapi);

    return () => {
      document.body.removeChild(scriptGapi);
    };
  }, []);

  // 3. Carregamento de Músicos (Ouvinte do Firestore)
  useEffect(() => {
    const collectionPath = getMusicosCollectionPath();
    if (!isDbReady || !collectionPath) {
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
  }, [isDbReady, userId]);

  // 4. Carregamento de Eventos (Ouvinte do Firestore)
  useEffect(() => {
    const collectionPath = getEventosCollectionPath();
    if (!isDbReady || !collectionPath) {
      setEventos([]);
      setLoadingEventos(false);
      return;
    };
    setLoadingEventos(true);
    const q = query(collection(db, collectionPath));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const eventosData = [];
        querySnapshot.forEach((doc) => {
          eventosData.push({ id: doc.id, ...doc.data() });
        });
        // Ordena os eventos por data de início
        eventosData.sort((a, b) => new Date(a.dataInicio) - new Date(b.dataInicio));
        setEventos(eventosData);
        setLoadingEventos(false);
      }, (err) => {
        console.error("[Firestore] Erro ao carregar eventos:", err);
        setGlobalError("Erro ao carregar lista de eventos.");
        setLoadingEventos(false);
      }
    );
    return () => unsubscribe();
  }, [isDbReady, userId]);

  // --- Funções de Inicialização GAPI ---
  const initializeGapi = () => {
    window.gapi.load('client', () => {
      window.gapi.client
        .init({
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
          ],
        })
        .then(() => {
          setGapiClient(window.gapi);
          console.log('GAPI client inicializado.');
        })
        .catch((e) => {
          console.error('Erro ao inicializar GAPI client:', e);
          setGlobalError('Erro ao inicializar GAPI client.');
        });
    });
  };

  // --- Funções de Autenticação Google ---
  const handleAuthClick = async () => {
    if (!gapiClient) {
      setGlobalError('Cliente GAPI não está pronto.');
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(CALENDAR_SCOPE);

      const result = await signInWithPopup(auth, provider);

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;

      if (token && result.user) {
        gapiClient.client.setToken({ access_token: token });
        console.log("GAPI autorizado com token.");

        setUserId(result.user.uid);
        setUserProfile({
          name: result.user.displayName,
          email: result.user.email,
          picture: result.user.photoURL,
        });
        setIsDbReady(true);
        console.log('Firebase Auth: Logado com Google UID:', result.user.uid);

        setGlobalError(null);
      } else {
        throw new Error("Não foi possível obter o token ou o usuário do Google.");
      }

    } catch (e) {
      console.error("Erro no login com Google:", e);
      setGlobalError(`Erro de autenticação: ${e.message}`);
      handleSignoutClick();
    }
  };

  const handleSignoutClick = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Erro ao deslogar:", e);
      setGlobalError("Erro ao tentar sair.");
    }

    setUserId(null);
    setUserProfile(null);
    setIsDbReady(false);
    if (gapiClient) {
      gapiClient.client.setToken(null);
    }
    setGlobalError(null);
    setMusicos([]);
    setEventos([]);
    console.log('Firebase Auth: Deslogado e estados limpos.');
  };
  
  // Deletar Evento (com SweetAlert2)
  const handleDeleteEvento = async (eventoId) => {
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
      confirmButtonColor: '#3085d6', // Azul
      cancelButtonColor: '#d33', // Vermelho
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
    // Código de layout limpo (sem hacks w-full)
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
    </header>
  );

  // --- Componente: Aba de Eventos (LAYOUT ATUALIZADO) ---
  const renderEventosPage = () => (
    // Padding menor no celular (p-4), maior no desktop (sm:p-8)
    <div className="bg-white rounded-lg shadow-xl p-4 sm:p-8">
      
      {/* Container do cabeçalho: flex-col no celular, flex-row no desktop */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6">
        
        {/* Título: ATUALIZADO (Dashboard de Eventos -> Eventos) */}
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-0">
          Eventos
        </h2>
        
        {/* Botão: w-full no celular, w-auto no desktop, tamanho de texto/padding reduzido */}
        <button
          onClick={() => setShowAddModal(true)} // ATUALIZADO: showAddModal
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
            // NOVO: A `li` agora é um `button` clicável
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
                    {/* Usa o novo helper para formatar a data */}
                    {formatDisplayDate(evento.dataInicio, evento.dataFim)}
                  </p>
                </div>
                
                {/* Container para os botões de ação */}
                <div className="flex flex-shrink-0 ml-2">
                  {/* NOVO: Botão de Editar (Lápis) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Não abre o modal de view
                      setEventoParaEditar(evento); // Abre o modal de EDIÇÃO
                    }}
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 p-2 rounded-full text-sm transition duration-300"
                    title="Editar evento"
                  >
                    {/* SVG do Lápis */}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"></path></svg>
                  </button>

                  {/* Botão de Deletar (Lixeira) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEvento(evento.id);
                    }}
                    className="bg-red-100 hover:bg-red-200 text-red-700 p-2 ml-2 rounded-full text-sm transition duration-300"
                    title="Deletar evento do app"
                  >
                    {/* SVG da lixeira */}
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

  // --- Componente: Aba de Músicos ---
  const renderMusicosPage = () => (
    <MusicosManager
      musicos={musicos}
      loading={loadingMusicos}
      collectionPath={getMusicosCollectionPath()}
      // Passa o setGlobalError para o MusicosManager poder mostrar erros globais
      setError={setGlobalError} 
    />
  );


  // --- Renderização Principal ---

  // Tela de Loading (Enquanto GAPI não está pronto)
  if (!gapiClient) {
    return (
      // O `index.html` agora força este a ter 100% de largura
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">
          Carregando bibliotecas do Google...
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
  return (
    // Código de layout limpo (sem hacks w-full)
    <div className="min-h-screen bg-gray-100 font-sans">
      {renderHeader()}
      
      <main className="py-6 px-4 sm:px-6 lg:px-8">
        {globalError && <ErrorMessage message={globalError} onDismiss={() => setGlobalError(null)} />}

        {page === 'eventos' && renderEventosPage()}
        {page === 'musicos' && renderMusicosPage()}
      </main>

      {/* O Modal de Adicionar/Editar Evento (LÓGICA ATUALIZADA) */}
      {(showAddModal || eventoParaEditar) && (
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
      
      {/* O Modal de Visualizar Evento */}
      {selectedEvento && (
        <ViewEventModal
          evento={selectedEvento}
          onClose={() => setSelectedEvento(null)}
        />
      )}
    </div>
  );
}

// --- Componentes Auxiliares ---

// NOVO COMPONENTE: Modal de Visualização de Evento
const ViewEventModal = ({ evento, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Cabeçalho do Modal */}
        <div className="flex justify-between items-start p-6 border-b border-gray-200">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">
              {evento.nome}
            </h3>
            <p className="text-sm text-gray-500">{evento.cidade}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-6">
          
          {/* Seção 1: Detalhes Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoItem label="Data & Horário" value={formatDisplayDate(evento.dataInicio, evento.dataFim)} />
            <InfoItem label="Status">
              <StatusBadge status={evento.status} />
            </InfoItem>
            <InfoItem label="Pacote" value={evento.pacote} />
          </div>

          {/* Seção 2: Finanças */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2 border-b pb-1">
              Financeiro
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem label="Valor Total do Evento" value={formatCurrency(evento.valorEvento)} />
            </div>
          </div>
          
          {/* Seção 3: Músicos */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2 border-b pb-1">
              Músicos e Cachets
            </h4>
            {evento.musicos && evento.musicos.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {evento.musicos.map(musico => (
                  <li key={musico.id} className="py-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{musico.nome}</p>
                      <p className="text-sm text-gray-500">{musico.instrumento}</p>
                    </div>
                    <p className="text-gray-700 font-semibold">
                      {formatCurrency(musico.cachet)}
                    </p>
                  </li>
                ))}
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
const AddEventModal = ({ onClose, musicosCadastrados, gapiClient, eventosCollectionPath, eventoParaEditar }) => {
  
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
    setSaving(true);

    try {
      // 1. Prepara dados comuns
      const dataInicioISO = `${data}T${horaInicio}:00`;
      const dataFimISO = `${data}T${horaFim}:00`;
      const fusoHorario = getLocalTimeZone();

      const musicosConvidados = selectedMusicos.map(musicoId => {
        const musico = musicosCadastrados.find(m => m.id === musicoId);
        return {
          id: musico.id,
          nome: musico.nome,
          email: musico.email,
          instrumento: musico.instrumento,
          cachet: cachets[musicoId] || '0',
        };
      });

      // 2. Objeto para o FIRESTORE (Com todos os dados financeiros)
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
      };
      
      // 3. Objeto para o GOOGLE CALENDAR (Limpo, sem finanças)
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
      
      // 4. LÓGICA DE SALVAR (CRIAR vs EDITAR)
      if (isEditMode) {
        // --- MODO DE ATUALIZAÇÃO ---
        
        // 1. Atualiza Firestore
        const eventoRef = doc(db, eventosCollectionPath, eventoParaEditar.id);
        await setDoc(eventoRef, {
          ...eventoParaFirestore,
          // Garante que o googleEventId (se existir) seja preservado
          googleEventId: eventoParaEditar.googleEventId || null 
        });
        
        // 2. Atualiza Google Calendar (se possível)
        if (eventoParaEditar.googleEventId) {
          await gapiClient.client.calendar.events.update({
            calendarId: 'primary',
            eventId: eventoParaEditar.googleEventId,
            resource: eventoParaGoogle,
          });
        } else {
          console.warn("Evento antigo sem googleEventId. Apenas o Firestore foi atualizado.");
        }
        
      } else {
        // --- MODO DE CRIAÇÃO ---
        
        // 1. Cria no Firestore PRIMEIRO (para ter o ID)
        // (Deixamos o googleEventId de fora por enquanto)
        const docRef = await addDoc(collection(db, eventosCollectionPath), eventoParaFirestore);
        
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


// Gerenciador de Músicos (ATUALIZADO COM SweetAlert2)
const MusicosManager = ({ musicos, loading, collectionPath, setError }) => {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [instrumento, setInstrumento] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null); // Erro local do formulário

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
    try {
      await addDoc(collection(db, collectionPath), {
        nome: nome,
        email: email,
        instrumento: instrumento,
      });
      setNome('');
      setEmail('');
      setInstrumento('');
    } catch (e) {
      console.error("[Firestore] Erro ao adicionar músico:", e);
      setFormError("Não foi possível salvar o músico.");
    }
    setSaving(false);
  };

  // Deletar Músico (com SweetAlert2)
  const handleDelete = async (musicoId) => {
    if (!collectionPath) {
      setError("Erro de conexão (User ID nulo).");
      return;
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
            Adicionar Músico
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
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Músico'}
            </button>
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
                  <div className="mb-2 sm:mb-0">
                    <p className="text-lg font-medium text-gray-900">{musico.nome}</p>
                    <p className="text-sm text-gray-600">{musico.instrumento}</p>
                    <p className="text-sm text-gray-500">{musico.email}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(musico.id)}
                    // ATUALIZADO: w-full no celular
                    className="w-full sm:w-auto bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-1 px-3 rounded-lg text-sm transition duration-300"
                  >
                    Deletar
                  </button>
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

// NOVO: Componente Helper para o Modal de Visualização
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

// NOVO: Componente Helper para o Modal de Visualização
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


export default App;
