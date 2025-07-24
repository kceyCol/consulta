// Variáveis globais
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let currentAudioBlob = null;
let currentRenameFilename = null;
let currentTranscriptionFile = null;
let recordingStartTime = null;
let segmentDuration = 5 * 60 * 1000; // 5 minutos
let segmentTimer = null;
let currentSegment = 1;
let recordingSession = null;
let currentDeleteFilename = null;
let currentDeleteType = null;
let recordingMode = 'simple'; // 'simple' ou 'session'

// Elementos DOM
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const refreshBtn = document.getElementById('refreshBtn');
const status = document.getElementById('status');
const recordingsList = document.getElementById('recordingsList');
const patientModal = document.getElementById('patientModal');
const patientNameInput = document.getElementById('patientNameInput');
const renameModal = document.getElementById('renameModal');
const renameInput = document.getElementById('renameInput');
const transcriptionModal = document.getElementById('transcriptionModal');
const transcriptionText = document.getElementById('transcriptionText');
const confirmModal = document.getElementById('confirmModal');

// Gerar ID único para sessão
function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Inicializar gravador
async function initializeRecorder() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
               mediaRecorder.ondataavailable = function(event) {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = function() {
            if (audioChunks.length > 0) {
                currentAudioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                
                if (recordingMode === 'session') {
                    // Apenas no modo sessão salva automaticamente
                    saveSegment();
                }
                // No modo simples, não salva automaticamente - espera o usuário definir o nome
            }
        };
        
        showStatus('🎤 Microfone inicializado com sucesso!', 'success');
    } catch (error) {
        showStatus('❌ Erro ao acessar microfone: ' + error.message, 'error');
    }
}

// Iniciar gravação
function startRecording() {
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
        audioChunks = [];
        recordingStartTime = Date.now();
        
        // Determinar modo de gravação baseado na duração esperada
        recordingMode = 'simple'; // Começar sempre como simples
        
        mediaRecorder.start();
        isRecording = true;
        
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        
        showStatus('🔴 Gravando...', 'info');
        
        // Timer para detectar gravação longa (mais de 5 minutos)
        segmentTimer = setTimeout(() => {
            if (isRecording) {
                // Mudar para modo sessão se gravação for muito longa
                recordingMode = 'session';
                currentSegment = 1;
                recordingSession = {
                    id: generateSessionId(),
                    startTime: new Date().toISOString(),
                    segments: []
                };
                
                stopCurrentSegment();
            }
        }, segmentDuration);
    }
}

// Parar segmento atual e iniciar próximo (apenas no modo sessão)
function stopCurrentSegment() {
    if (mediaRecorder && mediaRecorder.state === 'recording' && recordingMode === 'session') {
        mediaRecorder.stop();
        
        // Aguardar processamento do segmento atual
        setTimeout(() => {
            if (isRecording) {
                currentSegment++;
                audioChunks = [];
                mediaRecorder.start();
                
                showStatus(`🔴 Gravando... Segmento ${currentSegment}`, 'info');
                
                // Próximo timer
                segmentTimer = setTimeout(() => {
                    if (isRecording) {
                        stopCurrentSegment();
                    }
                }, segmentDuration);
            }
        }, 100);
    }
}

//-----------------------------------
// Parar gravação
// Parar gravação
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        clearTimeout(segmentTimer);
        mediaRecorder.stop();
        isRecording = false;
        
        recordBtn.disabled = false;
        stopBtn.disabled = true;
        
        const duration = Date.now() - recordingStartTime;
        
        if (recordingMode === 'simple') {
            showStatus('⏹️ Gravação finalizada.', 'info');
            // Aguardar processamento do áudio e mostrar modal
            setTimeout(() => {
                patientModal.style.display = 'block';
                patientNameInput.focus();
            }, 500);
        } else {
            showStatus('⏹️ Sessão finalizada. Salvando...', 'info');
            // Aguardar salvamento do último segmento
            setTimeout(() => {
                patientModal.style.display = 'block';
                patientNameInput.focus();
            }, 500);
        }
    }
}

// Salvar gravação simples
async function saveSimpleRecording(patientName = '') {
    if (!currentAudioBlob) return;
    
    try {
        // Converter blob para base64
        const reader = new FileReader();
        reader.onloadend = async function() {
            const base64Audio = reader.result;
            
            const response = await fetch('/save_recording', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    patient_name: patientName
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showStatus('✅ Gravação salva com sucesso!', 'success');
                loadRecordings();
            } else {
                showStatus('❌ Erro ao salvar: ' + result.message, 'error');
            }
        };
        reader.readAsDataURL(currentAudioBlob);
        
    } catch (error) {
        showStatus('❌ Erro ao salvar gravação: ' + error.message, 'error');
    }
}

// Salvar segmento (modo sessão)
async function saveSegment() {
    if (!currentAudioBlob || !recordingSession) return;
    
    try {
        // Converter blob para base64
        const reader = new FileReader();
        reader.onloadend = async function() {
            const base64Audio = reader.result;
            
            const response = await fetch('/save_segment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    session_id: recordingSession.id,
                    segment_number: currentSegment,
                    total_duration: Date.now() - recordingStartTime
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                recordingSession.segments.push({
                    number: currentSegment,
                    filename: result.filename,
                    timestamp: new Date().toISOString()
                });
                
                console.log(`Segmento ${currentSegment} salvo: ${result.filename}`);
            } else {
                showStatus('❌ Erro ao salvar segmento: ' + result.message, 'error');
            }
        };
        reader.readAsDataURL(currentAudioBlob);
        
    } catch (error) {
        showStatus('❌ Erro ao salvar segmento: ' + error.message, 'error');
    }
}

// Função auxiliar para formatar tamanho de arquivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Carregar lista de gravações
async function loadRecordings() {
    try {
        const response = await fetch('/recordings');
        const data = await response.json();
        
        recordingsList.innerHTML = '';
        
        // Verificar se a resposta foi bem-sucedida
        if (!data.success) {
            recordingsList.innerHTML = `<p>Erro: ${data.message}</p>`;
            return;
        }
        
        const { recordings, sessions } = data;
        
        // Verificar se há gravações ou sessões
        if (recordings.length === 0 && sessions.length === 0) {
            recordingsList.innerHTML = '<p>Nenhuma gravação encontrada.</p>';
            return;
        }
        
        // Processar gravações simples
        recordings.forEach(recording => {
            const item = document.createElement('div');
            item.className = 'recording-item';
            
            const transcriptionIndicator = recording.has_transcription ? 
                '<div class="transcription-indicator">✅ Transcrito</div>' : '';
            
            const transcriptionButtons = recording.has_transcription ? 
                `<button class="view-transcription-btn btn" onclick="viewTranscription('${recording.filename.replace('.wav', '_transcricao.txt')}')">
                    <span style="font-size: 18px; display: block;">👁️</span>
                    <span>Ver Transcrição</span>
                </button>
                <button class="download-transcription-btn btn" onclick="window.open('/download_transcription/${recording.filename.replace('.wav', '_transcricao.txt')}', '_blank')">
                    <span style="font-size: 18px; display: block;">📄</span>
                    <span>Baixar Transcrição</span>
                </button>` : 
                `<button class="transcribe-btn btn" onclick="transcribeRecording('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">🤖</span>
                    <span>Transcrever</span>
                </button>`;
            
            const actionButtons = `
                <button class="download-btn btn" onclick="downloadRecording('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">📥</span>
                    <span>Download</span>
                </button>
                <button class="rename-btn btn" onclick="showRenameModal('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">✏️</span>
                    <span>Renomear</span>
                </button>
                <button class="delete-btn btn" onclick="showDeleteConfirm('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">🗑️</span>
                    <span>Deletar</span>
                </button>`;
            
            // Extrair nome do paciente do filename
            const parts = recording.filename.split('_');
            let displayName = 'Gravação';
            if (parts.length >= 3) {
                displayName = parts[1] === 'conversa' ? 'Conversa' : parts[1];
            }
            
            // Formatar tamanho do arquivo
            const sizeFormatted = formatFileSize(recording.size);
            
            item.innerHTML = `
                <div class="recording-info">
                    <div class="recording-name">${displayName}</div>
                    <div class="recording-details">${sizeFormatted} • ${recording.filename}</div>
                    ${transcriptionIndicator}
                </div>
                <div class="recording-actions">
                    ${actionButtons}
                    ${transcriptionButtons}
                </div>
            `;
            recordingsList.appendChild(item);
        });
        
        // Processar sessões
        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'recording-item';
            
            const transcriptionIndicator = session.has_transcription ? 
                '<div class="transcription-indicator">✅ Transcrito</div>' : '';
            
            const transcriptionButtons = session.has_transcription ? 
                `<button class="view-transcription-btn btn" onclick="viewTranscription('${session.transcription_file}')">
                    <span style="font-size: 18px; display: block;">👁️</span>
                    <span>Ver Transcrição</span>
                </button>
                <button class="download-transcription-btn btn" onclick="window.open('/download_transcription/${session.transcription_file}', '_blank')">
                    <span style="font-size: 18px; display: block;">📄</span>
                    <span>Baixar Transcrição</span>
                </button>` : 
                `<button class="transcribe-btn btn" onclick="transcribeSession('${session.id}')">
                    <span style="font-size: 18px; display: block;">🤖</span>
                    <span>Transcrever Sessão</span>
                </button>`;
            
            const actionButtons = `
                <button class="delete-btn btn" onclick="showDeleteSessionConfirm('${session.id}')">
                    <span style="font-size: 18px; display: block;">🗑️</span>
                    <span>Deletar Sessão</span>
                </button>`;
            
            // Formatar tamanho total da sessão
            const sizeFormatted = formatFileSize(session.total_size);
            
            item.innerHTML = `
                <div class="recording-info">
                    <div class="recording-name">Sessão ${session.id}</div>
                    <div class="recording-details">${sizeFormatted} • ${session.segments.length} segmentos</div>
                    ${transcriptionIndicator}
                </div>
                <div class="recording-actions">
                    ${actionButtons}
                    ${transcriptionButtons}
                </div>
            `;
            recordingsList.appendChild(item);
        });
        
    } catch (error) {
        showStatus('❌ Erro ao carregar gravações: ' + error.message, 'error');
    }
}

// Funções de transcrição
async function transcribeRecording(filename) {
    try {
        showStatus('🤖 Transcrevendo gravação...', 'info');
        
        const response = await fetch('/transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename: filename })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('✅ ' + result.message, 'success');
            transcriptionText.textContent = result.transcription;
            currentTranscriptionFile = result.transcription_file;
            transcriptionModal.style.display = 'block';
            loadRecordings();
        } else {
            showStatus('❌ ' + result.message, 'error');
        }
    } catch (error) {
        showStatus('❌ Erro na transcrição: ' + error.message, 'error');
    }
}

async function transcribeSession(sessionId) {
    try {
        showStatus('🤖 Transcrevendo sessão...', 'info');
        
        const response = await fetch('/transcribe_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('✅ ' + result.message, 'success');
            transcriptionText.textContent = result.transcription;
            currentTranscriptionFile = result.transcription_file;
            transcriptionModal.style.display = 'block';
            loadRecordings();
        } else {
            showStatus('❌ ' + result.message, 'error');
        }
    } catch (error) {
        showStatus('❌ Erro na transcrição: ' + error.message, 'error');
    }
}

// Funções de modal
function showRenameModal(filename) {
    currentRenameFilename = filename;
    renameModal.style.display = 'block';
    renameInput.focus();
}

function showDeleteConfirm(filename) {
    currentDeleteFilename = filename;
    currentDeleteType = 'recording';
    confirmModal.style.display = 'block';
}

function showDeleteSessionConfirm(sessionId) {
    currentDeleteFilename = sessionId;
    currentDeleteType = 'session';
    confirmModal.style.display = 'block';
}

async function confirmDelete() {
    if (!currentDeleteFilename) return;
    
    confirmModal.style.display = 'none';
    
    try {
        const isSession = currentDeleteType === 'session';
        
        const endpoint = isSession ? '/delete_session' : '/delete_recording';
        const payload = isSession ? 
            { session_id: currentDeleteFilename } : 
            { filename: currentDeleteFilename };
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('✅ ' + result.message, 'success');
            loadRecordings();
        } else {
            showStatus('❌ ' + result.message, 'error');
        }
    } catch (error) {
        showStatus('❌ Erro ao deletar: ' + error.message, 'error');
    }
    
    currentDeleteFilename = null;
    currentDeleteType = null;
}

async function confirmRename() {
    const newPatientName = renameInput.value.trim();
    
    if (!newPatientName) {
        alert('Por favor, digite um nome para o paciente.');
        return;
    }
    
    renameModal.style.display = 'none';
    
    try {
        const response = await fetch('/rename_recording', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                old_filename: currentRenameFilename,
                new_name: newPatientName  // Mudança aqui: de 'patient_name' para 'new_name'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('✅ ' + result.message, 'success');
            loadRecordings();
        } else {
            showStatus('❌ ' + result.message, 'error');
        }
    } catch (error) {
        showStatus('❌ Erro ao renomear: ' + error.message, 'error');
    }
}

async function viewTranscription(transcriptionFile) {
    try {
        const response = await fetch(`/view_transcription/${transcriptionFile}`);
        const result = await response.json();
        
        if (result.success) {
            transcriptionText.textContent = result.content;
            currentTranscriptionFile = transcriptionFile;
            transcriptionModal.style.display = 'block';
        } else {
            showStatus('❌ ' + result.message, 'error');
        }
    } catch (error) {
        showStatus('❌ Erro ao carregar transcrição: ' + error.message, 'error');
    }
}

// Funções de fechamento de modal
function closePatientModal() {
    patientModal.style.display = 'none';
}

function closeRenameModal() {
    renameModal.style.display = 'none';
}

function closeTranscriptionModal() {
    transcriptionModal.style.display = 'none';
}

function closeConfirmModal() {
    confirmModal.style.display = 'none';
    currentDeleteFilename = null;
    currentDeleteType = null;
}

// Funções utilitárias
function saveWithPatientName() {
    const patientName = patientNameInput.value.trim();
    
    if (!patientName) {
        alert('Por favor, digite um nome para o paciente.');
        return;
    }
    
    // Salvar gravação simples com nome do paciente
    saveSimpleRecording(patientName);
    closePatientModal();
}

function saveWithoutPatientName() {
    // Salvar gravação simples sem nome do paciente
    saveSimpleRecording('');
    closePatientModal();
}

async function finalizeSession(patientName) {
    try {
        const response = await fetch('/finalize_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_name: patientName
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('✅ Sessão finalizada com sucesso!', 'success');
            loadRecordings();
        } else {
            showStatus('❌ ' + result.message, 'error');
        }
    } catch (error) {
        showStatus('❌ Erro ao finalizar sessão: ' + error.message, 'error');
    }
}

// Função para formatar tamanho de arquivo (se ainda não existir)
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Carregar lista de gravações
async function loadRecordings() {
    try {
        const response = await fetch('/recordings');
        const data = await response.json();
        
        recordingsList.innerHTML = '';
        
        // Verificar se a resposta foi bem-sucedida
        if (!data.success) {
            recordingsList.innerHTML = `<p>Erro: ${data.message}</p>`;
            return;
        }
        
        const { recordings, sessions } = data;
        
        // Verificar se há gravações ou sessões
        if (recordings.length === 0 && sessions.length === 0) {
            recordingsList.innerHTML = '<p>Nenhuma gravação encontrada.</p>';
            return;
        }
        
        // Processar gravações simples
        recordings.forEach(recording => {
            const item = document.createElement('div');
            item.className = 'recording-item';
            
            const transcriptionIndicator = recording.has_transcription ? 
                '<div class="transcription-indicator">✅ Transcrito</div>' : '';
            
            const transcriptionButtons = recording.has_transcription ? 
                `<button class="view-transcription-btn btn" onclick="viewTranscription('${recording.filename.replace('.wav', '_transcricao.txt')}')">
                    <span style="font-size: 18px; display: block;">👁️</span>
                    <span>Ver Transcrição</span>
                </button>
                <button class="download-transcription-btn btn" onclick="window.open('/download_transcription/${recording.filename.replace('.wav', '_transcricao.txt')}', '_blank')">
                    <span style="font-size: 18px; display: block;">📄</span>
                    <span>Baixar Transcrição</span>
                </button>` : 
                `<button class="transcribe-btn btn" onclick="transcribeRecording('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">🤖</span>
                    <span>Transcrever</span>
                </button>`;
            
            const actionButtons = `
                <button class="download-btn btn" onclick="downloadRecording('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">📥</span>
                    <span>Download</span>
                </button>
                <button class="rename-btn btn" onclick="showRenameModal('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">✏️</span>
                    <span>Renomear</span>
                </button>
                <button class="delete-btn btn" onclick="showDeleteConfirm('${recording.filename}')">
                    <span style="font-size: 18px; display: block;">🗑️</span>
                    <span>Deletar</span>
                </button>`;
            
            // Extrair nome do paciente do filename
            const parts = recording.filename.split('_');
            let displayName = 'Gravação';
            if (parts.length >= 3) {
                displayName = parts[1] === 'conversa' ? 'Conversa' : parts[1];
            }
            
            // Formatar tamanho do arquivo
            const sizeFormatted = formatFileSize(recording.size);
            
            item.innerHTML = `
                <div class="recording-info">
                    <div class="recording-name">${displayName}</div>
                    <div class="recording-details">${sizeFormatted} • ${recording.filename}</div>
                    ${transcriptionIndicator}
                </div>
                <div class="recording-actions">
                    ${actionButtons}
                    ${transcriptionButtons}
                </div>
            `;
            recordingsList.appendChild(item);
        });
        
        // Processar sessões
        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'recording-item';
            
            const transcriptionIndicator = session.has_transcription ? 
                '<div class="transcription-indicator">✅ Transcrito</div>' : '';
            
            const transcriptionButtons = session.has_transcription ? 
                `<button class="view-transcription-btn btn" onclick="viewTranscription('${session.transcription_file}')">
                    <span style="font-size: 18px; display: block;">👁️</span>
                    <span>Ver Transcrição</span>
                </button>
                <button class="download-transcription-btn btn" onclick="window.open('/download_transcription/${session.transcription_file}', '_blank')">
                    <span style="font-size: 18px; display: block;">📄</span>
                    <span>Baixar Transcrição</span>
                </button>` : 
                `<button class="transcribe-btn btn" onclick="transcribeSession('${session.id}')">
                    <span style="font-size: 18px; display: block;">🤖</span>
                    <span>Transcrever Sessão</span>
                </button>`;
            
            const actionButtons = `
                <button class="delete-btn btn" onclick="showDeleteSessionConfirm('${session.id}')">
                    <span style="font-size: 18px; display: block;">🗑️</span>
                    <span>Deletar Sessão</span>
                </button>`;
            
            // Formatar tamanho total da sessão
            const sizeFormatted = formatFileSize(session.total_size);
            
            item.innerHTML = `
                <div class="recording-info">
                    <div class="recording-name">Sessão ${session.id}</div>
                    <div class="recording-details">${sizeFormatted} • ${session.segments.length} segmentos</div>
                    ${transcriptionIndicator}
                </div>
                <div class="recording-actions">
                    ${actionButtons}
                    ${transcriptionButtons}
                </div>
            `;
            recordingsList.appendChild(item);
        });
        
    } catch (error) {
        showStatus('❌ Erro ao carregar gravações: ' + error.message, 'error');
    }
}

// Função para download de gravação
function downloadRecording(filename) {
    window.open(`/download/${filename}`, '_blank');
}

function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove('hidden');
    
    if (type === 'success') {
        setTimeout(() => {
            status.classList.add('hidden');
        }, 3000);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Botões principais
    recordBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    refreshBtn.addEventListener('click', loadRecordings);
    
    // Inputs de modal
    patientNameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveWithPatientName();
        }
    });
    
    renameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            confirmRename();
        }
    });
    
    // Fechar modais clicando fora
    window.addEventListener('click', function(e) {
        if (e.target === patientModal) {
            saveWithoutPatientName();
        }
        if (e.target === renameModal) {
            closeRenameModal();
        }
        if (e.target === transcriptionModal) {
            closeTranscriptionModal();
        }
        if (e.target === confirmModal) {
            closeConfirmModal();
        }
    });
    
    // Inicialização
    initializeRecorder();
    loadRecordings();
});