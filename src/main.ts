import "./style.css";
import "./panels.css";
import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack, LocalTrack, createLocalScreenTracks, createLocalAudioTrack, Track, VideoPresets } from "livekit-client";

// Build-time configuration - immediately available
declare const __AUTH_HOST__: string;
declare const __DEBUG_MODE__: boolean;
declare const __NODE_ENV__: string;

const authHost = __AUTH_HOST__;
const debugMode = __DEBUG_MODE__;
const nodeEnv = __NODE_ENV__;

console.log('Build-time config loaded:', { authHost, debugMode, nodeEnv });

// Extend window interface for Electron API
declare global {
  interface Window {
    electronAPI: {
      openAuthUrl: () => Promise<string>;
      setWindowOpacity: (opacity: number) => Promise<string>;
      setMouseEvents: (ignore: boolean) => Promise<string>;
      requestSystemPermissions: () => Promise<string>;
      checkPermissions: () => Promise<any>;
      onLoginComplete: (callback: (token: string) => void) => void;
      removeAllListeners: (channel: string) => void;
      closeWindow: () => Promise<void>;
      minimizeWindow: () => Promise<void>;
      getScreenSources: () => Promise<ScreenSource[]>;
    };
    platform: {
      isElectron: boolean;
      platform: string;
      versions: any;
    };
  }

  interface ImportMeta {
    hot?: {
      on: (event: string, callback: (data: any) => void) => void;
    };
  }
}

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface ScreenShareSettings {
  microphoneEnabled: boolean;
  computerVideoEnabled: boolean;
  computerAudioEnabled: boolean;
  selectedScreenId: string | null;
  availableScreens: ScreenSource[];
  inputsConnected: boolean;
  userDisabledComputerAudioInTextMode: boolean; // Track if user manually disabled in text mode
}

interface AgentTypeConfig {
  mode: 'voice' | 'text';
  microphoneEnabled: boolean;
  computerAudioEnabled: boolean;
  computerVideoEnabled: boolean;
  taggedHintsEnabled: boolean;
  systemPrompt: 'default' | 'sales';
}

const AGENT_TYPE_CONFIGS: Record<string, AgentTypeConfig> = {
  'default-voice': {
    mode: 'voice',
    microphoneEnabled: true,
    computerAudioEnabled: false,
    computerVideoEnabled: false,
    taggedHintsEnabled: false,
    systemPrompt: 'default'
  },
  'sales-voice': {
    mode: 'voice',
    microphoneEnabled: true,
    computerAudioEnabled: false,
    computerVideoEnabled: false,
    taggedHintsEnabled: false,
    systemPrompt: 'sales'
  },
  'default-text': {
    mode: 'text',
    microphoneEnabled: true,
    computerAudioEnabled: true,
    computerVideoEnabled: false,
    taggedHintsEnabled: false,
    systemPrompt: 'default'
  },
  'sales-hint': {
    mode: 'text',
    microphoneEnabled: true,
    computerAudioEnabled: true,
    computerVideoEnabled: false,
    taggedHintsEnabled: true,
    systemPrompt: 'sales'
  }
};

interface AppState {
  isLoggedIn: boolean;
  isRecording: boolean;
  room: Room | null;
  persistentRoom: Room | null; // Stays connected to keep room alive
  videoTrack: LocalVideoTrack | null;
  audioTrack: LocalAudioTrack | null; // Microphone track
  screenVideoTrack: LocalVideoTrack | null; // Computer screen video
  screenAudioTrack: LocalAudioTrack | null; // Computer screen audio
  authToken: string | null;
  permissions: {
    microphone: boolean;
    screen: boolean;
    audio: boolean;
  };
  screenShare: ScreenShareSettings;
  agentType: string; // Current agent type
  assistantMode: 'voice' | 'text'; // Voice Assistant or Text Assistant mode (derived from agent type)
  systemPrompt: 'default' | 'sales'; // System prompt type (derived from agent type)
  taggedHintsEnabled: boolean; // Tagged hints on/off (derived from agent type)
  importanceLevel: number; // Importance level filter (1-4)
  showDebugButton: boolean; // Show/hide debug button in main panel
  tokenInfo: {
    remainingMinutes: number;
    dailyAllowance: number;
    isApproximate: boolean;
    lastUpdated: Date | null;
    nextRenewalTime: Date | null;
    userTimeZone: string;
  };
}

const state: AppState = {
  isLoggedIn: false,
  isRecording: false,
  room: null,
  persistentRoom: null,
  videoTrack: null,
  audioTrack: null,
  screenVideoTrack: null,
  screenAudioTrack: null,
  authToken: null,
  permissions: {
    microphone: false,
    screen: false,
    audio: false,
  },
  screenShare: {
    microphoneEnabled: true, // Default enabled
    computerVideoEnabled: true, // Default enabled
    computerAudioEnabled: false, // Default disabled for voice mode
    selectedScreenId: null,
    availableScreens: [],
    inputsConnected: false,
    userDisabledComputerAudioInTextMode: false, // Track user preference for text mode
  },
  agentType: 'sales-hint', // Default agent type
  assistantMode: 'text', // Default to Text Assistant mode
  systemPrompt: 'default', // Default to Default Assistant
  taggedHintsEnabled: true, // Tagged hints on/off
  importanceLevel: 4, // Importance level filter (1-4)
  showDebugButton: debugMode, // Default to hiding debug button
  tokenInfo: {
    remainingMinutes: 0,
    dailyAllowance: 0,
    isApproximate: false,
    lastUpdated: null,
    nextRenewalTime: null,
    userTimeZone: 'UTC',
  },
};

// DOM Elements
let browserLoginBtn: HTMLButtonElement;
let minimizeBtn: HTMLButtonElement;
let closePanelBtn: HTMLButtonElement;
let tokenDisplay: HTMLSpanElement;

// Panel elements
let loginControls: HTMLDivElement;
let recordingControls: HTMLDivElement;
let panelRecordBtn: HTMLButtonElement;
let panelAgentDropdown: HTMLSelectElement;
let panelTimer: HTMLSpanElement;
let panelMicBtn: HTMLButtonElement;
let panelAudioBtn: HTMLButtonElement;
let panelScreenBtn: HTMLButtonElement;
let panelSettingsBtn: HTMLButtonElement;
let panelDebugBtn: HTMLButtonElement;

// Settings panel elements
let settingsPanel: HTMLDivElement;
let closeSettingsBtn: HTMLButtonElement;
let displayTab: HTMLButtonElement;
let inputsTab: HTMLButtonElement;
let displayContent: HTMLDivElement;
let inputsContent: HTMLDivElement;
let settingsThemeToggle: HTMLButtonElement;
let settingsOpacitySlider: HTMLInputElement;
let settingsOpacityValue: HTMLSpanElement;
let settingsScreenDropdown: HTMLSelectElement;
let settingsScreenPreview: HTMLDivElement;
let settingsConnectBtn: HTMLButtonElement;
let settingsInputsStatus: HTMLSpanElement;
let settingsMicrophoneLevel: HTMLDivElement;
let settingsComputerAudioLevel: HTMLDivElement;
let settingsMicrophoneLevelBar: HTMLDivElement;
let settingsComputerAudioLevelBar: HTMLDivElement;
let settingsDebugButtonToggle: HTMLInputElement;
let recordingStatus: HTMLDivElement;
let livekitStatus: HTMLDivElement;
let requestPermissionsBtn: HTMLButtonElement;
let refreshPermissionsBtn: HTMLButtonElement;
let micStatus: HTMLSpanElement;
let screenStatus: HTMLSpanElement;
let audioStatus: HTMLSpanElement;
let opacitySlider: HTMLInputElement;
let opacityValue: HTMLSpanElement;
let closeBtn: HTMLButtonElement;
let themeToggleBtn: HTMLButtonElement;

// Panel group and panel elements
let panelGroup: HTMLDivElement;
let transcriptPanel: HTMLDivElement;
let closeTranscriptBtn: HTMLButtonElement;
let showTranscriptBtn: HTMLButtonElement;
let outputPanel: HTMLDivElement;
let closeOutputBtn: HTMLButtonElement;
let outputPanelTitle: HTMLSpanElement;
let textModeContent: HTMLDivElement;
let hintModeContent: HTMLDivElement;
let voiceModeContent: HTMLDivElement;
let textResponsesContainer: HTMLDivElement;
let hintsContainer: HTMLDivElement;
let outputImportanceSlider: HTMLInputElement;

// Debug panel elements
let debugPanel: HTMLDivElement;
let closeDebugBtn: HTMLButtonElement;

// Screen sharing DOM elements
let microphoneToggle: HTMLInputElement;
let computerVideoToggle: HTMLInputElement;
let computerAudioToggle: HTMLInputElement;
let screenSourceDropdown: HTMLSelectElement;
let refreshScreensBtn: HTMLButtonElement;
let screenPreviewContainer: HTMLDivElement;
let connectInputsBtn: HTMLButtonElement;
let disconnectInputsBtn: HTMLButtonElement;
let inputsStatus: HTMLDivElement;

// Audio level indicators
let microphoneLevelBar: HTMLDivElement;
let computerAudioLevelBar: HTMLDivElement;

// Agent type elements
let agentTypeDropdown: HTMLSelectElement;
let conversationTranscript: HTMLDivElement;
let textResponseDisplay: HTMLDivElement;
let textResponseSection: HTMLDivElement;

// Tagged hints elements
let importanceSlider: HTMLInputElement;
let importanceSliderSection: HTMLDivElement;

// Text response history for the new panel
const textResponseHistory: string[] = [];

// Theme state
let currentTheme: 'light' | 'dark' = 'light';

// Video configuration
const VIDEO_FRAME_RATE = 1; // FPS - 1 frame per second by default

// Screen preview update timer
let screenPreviewTimer: number | null = null;

// Audio level monitoring timer
let audioLevelTimer: number | null = null;

// Audio analyzers for volume monitoring
let microphoneAnalyzer: AnalyserNode | null = null;
let computerAudioAnalyzer: AnalyserNode | null = null;
let audioContext: AudioContext | null = null;

// Timer functionality
let recordingStartTime: Date | null = null;
let timerInterval: number | null = null;

// Token tracking
let tokenFetchTimeout: number | null = null;

// Track transcription segments - store latest version of each segment
const transcriptionSegments = new Map<string, {text: string, final: boolean, participant: string, trackSource: any}>();

// Track hints history - store the last k hints for each importance level separately
interface Hint {
  id: string;
  importance: number;
  title: string;
  description: string;
  timestamp: Date;
  iconTitle: string; // e.g., "📈 Product"
}

const HINTS_PER_IMPORTANCE_LEVEL = 5; // Keep last 5 hints per importance level
const hintsHistory: { [key: number]: Hint[] } = {
  1: [],
  2: [],
  3: [],
  4: []
};

function parseHintsFromText(text: string): Hint[] {
  const hints: Hint[] = [];
  
  // Check if the text contains the expected format: ```text...```
  const codeBlockMatch = text.match(/```text\s*([\s\S]*?)\s*```/);
  if (!codeBlockMatch) {
    return hints;
  }
  
  const hintsText = codeBlockMatch[1].trim();
  if (!hintsText) {
    return hints;
  }
  
  // Parse individual hints: <1><title>📈 Product</title> Description</1>
  const hintPattern = /<(\d+)><title>(.*?)<\/title>\s*(.*?)<\/\1>/g;
  let match;
  
  while ((match = hintPattern.exec(hintsText)) !== null) {
    const importance = parseInt(match[1]);
    const iconTitle = match[2].trim();
    const description = match[3].trim();
    
    // Extract just the title part (after the emoji) - simplified approach
    const titleMatch = iconTitle.match(/^.+?\s+(.*)$/);
    const title = titleMatch ? titleMatch[1] : iconTitle;
    
    hints.push({
      id: `hint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      importance,
      title,
      description,
      timestamp: new Date(),
      iconTitle
    });
  }
  
  return hints;
}

function addHintsToHistory(hints: Hint[]) {
  // Add each hint to its appropriate importance level array
  hints.forEach(hint => {
    hintsHistory[hint.importance].unshift(hint);
    
    // Keep only the last k hints for this importance level
    if (hintsHistory[hint.importance].length > HINTS_PER_IMPORTANCE_LEVEL) {
      hintsHistory[hint.importance].splice(HINTS_PER_IMPORTANCE_LEVEL);
    }
  });
  
  updateDebugStatus(`Added ${hints.length} hints to history`);
}

function clearHintsHistory() {
  // Clear all hints from all importance levels
  hintsHistory[1] = [];
  hintsHistory[2] = [];
  hintsHistory[3] = [];
  hintsHistory[4] = [];
  
  updateDebugStatus("Cleared all hints history for new call");
  
  // Update display if hints are enabled
  if (state.taggedHintsEnabled) {
    updateHintsDisplay();
  }
}

function updateHintsDisplay() {
  if (!textResponseDisplay || !state.taggedHintsEnabled) {
    return;
  }
  
  // Collect hints from all importance levels <= selected level
  const allRelevantHints: Hint[] = [];
  for (let level = 1; level <= state.importanceLevel; level++) {
    allRelevantHints.push(...hintsHistory[level]);
  }
  
  // Sort by timestamp (most recent first)
  allRelevantHints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  // Take the last 5 hints
  const displayHints = allRelevantHints.slice(0, 5);
  
  // Clear current display
  textResponseDisplay.innerHTML = '';
  
  if (displayHints.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'text-response-placeholder';
    placeholder.textContent = 'No hints at this importance level yet...';
    textResponseDisplay.appendChild(placeholder);
    return;
  }
  
  // Create hint boxes
  displayHints.forEach(hint => {
    const hintBox = document.createElement('div');
    hintBox.className = `hint-box importance-${hint.importance}`;
    
    const hintHeader = document.createElement('div');
    hintHeader.className = 'hint-header';
    
    const importanceTag = document.createElement('span');
    importanceTag.className = `importance-tag level-${hint.importance}`;
    importanceTag.textContent = hint.importance.toString();
    
    const hintTitle = document.createElement('span');
    hintTitle.className = 'hint-title';
    hintTitle.textContent = hint.iconTitle;
    
    const hintTime = document.createElement('span');
    hintTime.className = 'hint-time';
    hintTime.textContent = hint.timestamp.toLocaleTimeString();
    
    hintHeader.appendChild(importanceTag);
    hintHeader.appendChild(hintTitle);
    hintHeader.appendChild(hintTime);
    
    const hintContent = document.createElement('div');
    hintContent.className = 'hint-content';
    hintContent.textContent = hint.description;
    
    hintBox.appendChild(hintHeader);
    hintBox.appendChild(hintContent);
    
    textResponseDisplay.appendChild(hintBox);
  });
}

// Panel Group Functions
function updatePanelGroupVisibility() {
  if (!panelGroup) return;
  
  const transcriptVisible = transcriptPanel && !transcriptPanel.classList.contains('hidden');
  const outputVisible = outputPanel && !outputPanel.classList.contains('hidden');
  const settingsVisible = settingsPanel && !settingsPanel.classList.contains('hidden');
  const debugVisible = debugPanel && !debugPanel.classList.contains('hidden');
  
  if (transcriptVisible || outputVisible || settingsVisible || debugVisible) {
    panelGroup.classList.remove('hidden');
    updateDebugStatus(`Panel group shown - Transcript: ${transcriptVisible}, Output: ${outputVisible}, Settings: ${settingsVisible}, Debug: ${debugVisible}`);
  } else {
    panelGroup.classList.add('hidden');
    updateDebugStatus("Panel group hidden - no panels visible");
  }
}

// Transcript Panel Functions
function showTranscriptPanel() {
  if (transcriptPanel) {
    transcriptPanel.classList.remove('hidden');
    updatePanelGroupVisibility();
    updateDebugStatus("Transcript panel opened");
  }
}

function hideTranscriptPanel() {
  if (transcriptPanel) {
    transcriptPanel.classList.add('hidden');
    updatePanelGroupVisibility();
    updateDebugStatus("Transcript panel closed");
  }
}

// Output Panel Functions
function showOutputPanel() {
  if (outputPanel) {
    outputPanel.classList.remove('hidden');
    updateOutputPanelContent();
    updatePanelGroupVisibility();
    updateDebugStatus("Output panel opened");
  }
}

function hideOutputPanel() {
  if (outputPanel) {
    outputPanel.classList.add('hidden');
    updatePanelGroupVisibility();
    updateDebugStatus("Output panel closed");
  }
}

function updateOutputPanelContent() {
  if (!outputPanel) return;
  
  // Hide all content sections first
  if (textModeContent) textModeContent.classList.remove('active');
  if (hintModeContent) hintModeContent.classList.remove('active');
  if (voiceModeContent) voiceModeContent.classList.remove('active');
  
  // Update panel title and show appropriate content based on agent type
  if (state.assistantMode === 'voice') {
    if (outputPanelTitle) outputPanelTitle.textContent = 'Voice Agent';
    if (voiceModeContent) voiceModeContent.classList.add('active');
  } else if (state.taggedHintsEnabled) {
    if (outputPanelTitle) outputPanelTitle.textContent = 'Assistant Hints';
    if (hintModeContent) hintModeContent.classList.add('active');
    updateOutputPanelHints();
  } else {
    if (outputPanelTitle) outputPanelTitle.textContent = 'Text Responses';
    if (textModeContent) textModeContent.classList.add('active');
    updateOutputPanelTextResponses();
  }
  
  // Update close button state based on recording status
  updateOutputPanelCloseButton();
}

function updateOutputPanelTextResponses() {
  if (!textResponsesContainer) return;
  
  // Clear current content
  textResponsesContainer.innerHTML = '';
  
  if (textResponseHistory.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'text-response-placeholder';
    placeholder.textContent = 'No text responses yet...';
    textResponsesContainer.appendChild(placeholder);
    return;
  }
  
  // Show last 3 responses (newest first)
  const recentResponses = textResponseHistory.slice(-3).reverse();
  
  recentResponses.forEach((response, index) => {
    const responseItem = document.createElement('div');
    responseItem.className = 'text-response-item';
    if (index === 0) {
      responseItem.classList.add('newest');
    }
    responseItem.textContent = response;
    textResponsesContainer.appendChild(responseItem);
  });
}

function updateOutputPanelHints() {
  if (!hintsContainer) return;
  
  // Collect hints from all importance levels <= selected level
  const allRelevantHints: Hint[] = [];
  for (let level = 1; level <= state.importanceLevel; level++) {
    allRelevantHints.push(...hintsHistory[level]);
  }
  
  // Sort by timestamp (most recent first)
  allRelevantHints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  // Take the last 5 hints
  const displayHints = allRelevantHints.slice(0, 5);
  
  // Clear current content
  hintsContainer.innerHTML = '';
  
  if (displayHints.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'hints-placeholder';
    placeholder.textContent = 'No hints at this importance level yet...';
    hintsContainer.appendChild(placeholder);
    return;
  }
  
  // Create hint boxes
  displayHints.forEach(hint => {
    const hintBox = document.createElement('div');
    hintBox.className = `hint-box importance-${hint.importance}`;
    
    const hintHeader = document.createElement('div');
    hintHeader.className = 'hint-header';
    
    const importanceTag = document.createElement('span');
    importanceTag.className = `importance-tag level-${hint.importance}`;
    importanceTag.textContent = hint.importance.toString();
    
    const hintTitle = document.createElement('span');
    hintTitle.className = 'hint-title';
    hintTitle.textContent = hint.iconTitle;
    
    const hintTime = document.createElement('span');
    hintTime.className = 'hint-time';
    hintTime.textContent = hint.timestamp.toLocaleTimeString();
    
    hintHeader.appendChild(importanceTag);
    hintHeader.appendChild(hintTitle);
    hintHeader.appendChild(hintTime);
    
    const hintContent = document.createElement('div');
    hintContent.className = 'hint-content';
    hintContent.textContent = hint.description;
    
    hintBox.appendChild(hintHeader);
    hintBox.appendChild(hintContent);
    
    hintsContainer.appendChild(hintBox);
  });
}

function updateDebugButtonVisibility() {
  if (!panelDebugBtn) return;
  
  if (state.showDebugButton) {
    panelDebugBtn.classList.remove('hidden');
  } else {
    panelDebugBtn.classList.add('hidden');
  }
}

function updateOutputPanelCloseButton() {
  if (!closeOutputBtn) return;
  
  if (state.isRecording) {
    // Disable close button during recording
    closeOutputBtn.disabled = true;
    closeOutputBtn.classList.add('disabled');
    closeOutputBtn.title = 'Stop recording to close panel';
    updateDebugStatus("Output panel close button disabled during recording");
  } else {
    // Enable close button when not recording
    closeOutputBtn.disabled = false;
    closeOutputBtn.classList.remove('disabled');
    closeOutputBtn.title = 'Close panel';
    updateDebugStatus("Output panel close button enabled");
  }
}

// Debug Panel Functions
function showDebugPanel() {
  if (debugPanel) {
    debugPanel.classList.remove('hidden');
    updatePanelGroupVisibility();
    updateDebugStatus("Debug panel opened");
  }
}

function hideDebugPanel() {
  if (debugPanel) {
    debugPanel.classList.add('hidden');
    updatePanelGroupVisibility();
    updateDebugStatus("Debug panel closed");
  }
}

function toggleDebugPanel() {
  if (debugPanel) {
    const isHidden = debugPanel.classList.contains('hidden');
    if (isHidden) {
      showDebugPanel();
      // Also enable debug mode to show the red border
      toggleDebugMode();
    } else {
      hideDebugPanel();
      // Also disable debug mode to hide the red border
      toggleDebugMode();
    }
  }
}

function updateDebugStatus(message: string) {
  // Add message to history
  const debugMessage: DebugMessage = {
    timestamp: new Date(),
    message: message
  };
  
  debugMessageHistory.push(debugMessage);
  
  // Keep only the last MAX_DEBUG_MESSAGES messages
  if (debugMessageHistory.length > MAX_DEBUG_MESSAGES) {
    debugMessageHistory.splice(0, debugMessageHistory.length - MAX_DEBUG_MESSAGES);
  }
  
  // Update the debug status display
  updateDebugStatusDisplay();
  
  console.log(`Debug: ${message}`);
}

function updateDebugStatusDisplay() {
  const debugElement = document.getElementById("debug-status");
  if (!debugElement) return;
  
  // Clear current content
  debugElement.innerHTML = '';
  
  if (debugMessageHistory.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'debug-message-placeholder';
    placeholder.textContent = 'No debug messages yet...';
    debugElement.appendChild(placeholder);
    return;
  }
  
  // Create message elements (newest first)
  const recentMessages = debugMessageHistory.slice().reverse();
  
  recentMessages.forEach((debugMsg, index) => {
    const messageElement = document.createElement('div');
    messageElement.className = 'debug-message-item';
    if (index === 0) {
      messageElement.classList.add('newest');
    }
    
    const timestampElement = document.createElement('span');
    timestampElement.className = 'debug-message-time';
    timestampElement.textContent = debugMsg.timestamp.toLocaleTimeString();
    
    const messageTextElement = document.createElement('span');
    messageTextElement.className = 'debug-message-text';
    messageTextElement.textContent = debugMsg.message;
    
    messageElement.appendChild(timestampElement);
    messageElement.appendChild(messageTextElement);
    debugElement.appendChild(messageElement);
  });
}

function toggleDebugMode() {
  const container = document.querySelector('.container');
  const body = document.body;
  const html = document.documentElement;
  
  if (container) {
    const isDebugMode = container.classList.contains('debug-mode');
    
    if (isDebugMode) {
      // Turn off debug mode
      container.classList.remove('debug-mode');
      body.classList.remove('debug-mode');
      html.classList.remove('debug-mode');
      updateDebugStatus("Debug mode disabled - sections hidden");
    } else {
      // Turn on debug mode
      container.classList.add('debug-mode');
      body.classList.add('debug-mode');
      html.classList.add('debug-mode');
      updateDebugStatus("Debug mode enabled - sections visible with scrolling");
    }
  } else {
    updateDebugStatus("Could not find container element");
  }
}

// Timer functions
function startTimer() {
  recordingStartTime = new Date();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = setInterval(updateTimer, 1000) as unknown as number;
  updateTimer();
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  recordingStartTime = null;
  const timerElement = document.getElementById("panel-timer") as HTMLSpanElement;
  if (timerElement) {
    timerElement.textContent = "00:00";
  }
}

function updateTimer() {
  const timerElement = document.getElementById("panel-timer") as HTMLSpanElement;
  if (!recordingStartTime || !timerElement) return;
  
  const now = new Date();
  const elapsed = Math.floor((now.getTime() - recordingStartTime.getTime()) / 1000);
  
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  
  let timeString;
  if (hours > 0) {
    timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  timerElement.textContent = timeString;
}

// Token tracking functions
async function fetchRemainingTokens(): Promise<void> {
  try {
    const url = `${authHost}/api/user/remaining-time`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add authorization header if we have a token
    if (state.authToken) {
      headers['Authorization'] = `Bearer ${state.authToken}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    state.tokenInfo.remainingMinutes = data.remainingMinutes;
    state.tokenInfo.dailyAllowance = data.dailyAllowance || 0;
    state.tokenInfo.isApproximate = false;
    state.tokenInfo.lastUpdated = new Date();
    state.tokenInfo.nextRenewalTime = data.nextRenewalTime ? new Date(data.nextRenewalTime) : null;
    state.tokenInfo.userTimeZone = data.userTimeZone || 'UTC';
    
    updateTokenDisplay();
    updateDebugStatus(`🎫 Token info updated: ${data.remainingMinutes} minutes remaining, next renewal: ${data.nextRenewalTime}`);
    
  } catch (error) {
    updateDebugStatus(`❌ Failed to fetch token info: ${error}`);
    console.error('Failed to fetch remaining tokens:', error);
  }
}

function updateTokenDisplay(): void {
  if (!tokenDisplay) return;
  
  const { remainingMinutes, dailyAllowance, isApproximate, nextRenewalTime, userTimeZone } = state.tokenInfo;
  const prefix = isApproximate ? '~' : '';
  
  // Update text content to just show [XX] format
  tokenDisplay.textContent = `[${prefix}${remainingMinutes}]`;
  
  // Calculate percentage remaining for color coding
  const percentageRemaining = dailyAllowance > 0 ? (remainingMinutes / dailyAllowance) * 100 : 0;
  
  // Remove all color classes first
  tokenDisplay.classList.remove('token-high', 'token-medium', 'token-low', 'token-empty');
  
  // Add appropriate color class based on percentage
  if (remainingMinutes === 0) {
    tokenDisplay.classList.add('token-empty'); // Grey for 0 tokens
  } else if (percentageRemaining > 30) {
    tokenDisplay.classList.add('token-high'); // Green for >30%
  } else if (percentageRemaining > 10) {
    tokenDisplay.classList.add('token-medium'); // Orange for >10%
  } else {
    tokenDisplay.classList.add('token-low'); // Red for ≤10%
  }
  
  // Create tooltip with conversation minutes and next renewal time
  let tooltip = `${remainingMinutes} tokens remaining (roughly ${remainingMinutes} minutes)`;
  if (dailyAllowance > 0) {
    tooltip += `\nDaily allowance: ${dailyAllowance} tokens (${percentageRemaining.toFixed(1)}% remaining)`;
  }
  
  if (nextRenewalTime) {
    const renewalDate = new Date(nextRenewalTime);
    const now = new Date();
    const timeUntilRenewal = renewalDate.getTime() - now.getTime();
    const hoursUntilRenewal = Math.floor(timeUntilRenewal / (1000 * 60 * 60));
    const minutesUntilRenewal = Math.floor((timeUntilRenewal % (1000 * 60 * 60)) / (1000 * 60));
    
    let renewalText = '';
    if (hoursUntilRenewal > 0) {
      renewalText = `${hoursUntilRenewal}h ${minutesUntilRenewal}m`;
    } else if (minutesUntilRenewal > 0) {
      renewalText = `${minutesUntilRenewal}m`;
    } else {
      renewalText = 'less than 1 minute';
    }
    
    tooltip += `\n\nNext tokens available in: ${renewalText}`;
    
    // Add formatted renewal time using system locale and timezone
    const renewalTimeString = renewalDate.toLocaleString(undefined, {
      timeZone: userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    tooltip += `\n(${renewalTimeString})`;
  }
  
  tokenDisplay.title = tooltip;
}

function scheduleTokenFetch(delayMs: number): void {
  if (tokenFetchTimeout) {
    clearTimeout(tokenFetchTimeout);
  }
  
  tokenFetchTimeout = setTimeout(() => {
    fetchRemainingTokens();
  }, delayMs) as unknown as number;
}

function computeApproximateTokensUsed(): number {
  if (!recordingStartTime) return 0;
  
  const elapsed = Math.floor((new Date().getTime() - recordingStartTime.getTime()) / 1000);
  const minutes = Math.ceil(elapsed / 60); // Round up to nearest minute
  return minutes;
}

function updateApproximateTokens(): void {
  const tokensUsed = computeApproximateTokensUsed();
  const currentDisplayedTokens = state.tokenInfo.remainingMinutes;
  const approximateRemaining = Math.max(0, currentDisplayedTokens - tokensUsed);
  
  // Update internal state
  state.tokenInfo.remainingMinutes = approximateRemaining;
  state.tokenInfo.isApproximate = true;
  
  // Update display using the main function (which handles color coding)
  updateTokenDisplay();
  
  updateDebugStatus(`🎫 Approximate tokens: ${approximateRemaining} (had ${currentDisplayedTokens}, used: ${tokensUsed} minutes)`);
}

// Map to track speech bubbles by segment ID
const speechBubbles = new Map<string, HTMLDivElement>();

function addConversationSeparator() {
  if (!conversationTranscript) return;
  
  // Only add separator if there are existing messages
  const existingMessages = conversationTranscript.querySelectorAll('.speech-bubble, .system-message');
  if (existingMessages.length === 0) return;
  
  const separator = document.createElement('div');
  separator.className = 'conversation-separator';
  conversationTranscript.appendChild(separator);
}

function addSystemMessage(text: string, timestamp?: Date) {
  if (!conversationTranscript) return;
  
  // Clear placeholder if this is the first message
  const placeholder = conversationTranscript.querySelector('.transcript-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const systemMessage = document.createElement('div');
  systemMessage.className = 'system-message';
  
  const messageTime = timestamp || new Date();
  const timeString = messageTime.toLocaleTimeString();
  
  systemMessage.textContent = `${text} at ${timeString}`;
  
  conversationTranscript.appendChild(systemMessage);
  
  // Auto-scroll to bottom
  conversationTranscript.scrollTop = conversationTranscript.scrollHeight;
}

function updateTextResponse(text: string) {
  if (!textResponseDisplay) return;
  
  // Clear placeholder if this is the first message
  const placeholder = textResponseDisplay.querySelector('.text-response-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  // Check if tagged hints are enabled
  if (state.taggedHintsEnabled) {
    // Parse hints from the text (only well-formatted hints in ```text``` blocks)
    const hints = parseHintsFromText(text);
    
    if (hints.length > 0) {
      // Add hints to history
      addHintsToHistory(hints);
      
      // Update hints display in both old and new locations
      updateHintsDisplay();
      updateOutputPanelHints();
    } else {
      // No well-formatted hints found
      updateDebugStatus("No well-formatted hints found in text response");
    }
  } else {
    // Tagged hints disabled, show regular text
    textResponseDisplay.innerHTML = '';
    const responseContent = document.createElement('div');
    responseContent.className = 'text-response-content';
    responseContent.textContent = text;
    textResponseDisplay.appendChild(responseContent);
    
    // Add to text response history for the output panel
    textResponseHistory.push(text);
    
    // Keep only last 10 responses to prevent memory issues
    if (textResponseHistory.length > 10) {
      textResponseHistory.splice(0, textResponseHistory.length - 10);
    }
    
    // Update the output panel
    updateOutputPanelTextResponses();
  }
}

function displayConversationMessage(
  text: string, 
  segmentId: string, 
  participantType: 'user' | 'user-pc' | 'assistant' | 'assistant-transcript', 
  isFinal: boolean = false,
  participantName: string = '',
  timestamp?: Date
) {
  if (!conversationTranscript) return;
  
  // Clear placeholder if this is the first message
  const placeholder = conversationTranscript.querySelector('.transcript-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  // Check if we already have a bubble for this segment
  let bubble = speechBubbles.get(segmentId);
  
  if (!bubble) {
    // Create new speech bubble
    bubble = document.createElement('div');
    bubble.className = `speech-bubble ${participantType} ${isFinal ? 'final' : 'partial'}`;
    bubble.setAttribute('data-segment-id', segmentId);
    
    // Add speaker label
    const speakerLabel = document.createElement('div');
    speakerLabel.className = 'speaker-label';
    let labelText = '';
    switch (participantType) {
      case 'user':
        labelText = 'You';
        break;
      case 'user-pc':
        labelText = 'Your PC';
        break;
      case 'assistant':
        labelText = 'Assistant';
        break;
      case 'assistant-transcript':
        labelText = 'Assistant (Speech)';
        break;
    }
    speakerLabel.textContent = labelText;
    
    // Add message content
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = text;
    
    // Add typing indicator for partial messages (positioned absolutely)
    if (!isFinal) {
      const typingIndicator = document.createElement('span');
      typingIndicator.className = 'typing-indicator';
      bubble.appendChild(typingIndicator); // Add to bubble, not messageContent
    }
    
    // Add timestamp
    const timestampElement = document.createElement('div');
    timestampElement.className = 'message-timestamp';
    const messageTime = timestamp || new Date();
    timestampElement.textContent = messageTime.toLocaleTimeString();
    
    bubble.appendChild(speakerLabel);
    bubble.appendChild(messageContent);
    bubble.appendChild(timestampElement);
    
    // Add to transcript container
    conversationTranscript.appendChild(bubble);
    speechBubbles.set(segmentId, bubble);
  } else {
    // Update existing bubble
    const messageContent = bubble.querySelector('.message-content');
    if (messageContent) {
      // Update text content
      messageContent.textContent = text;
    }
    
    // Handle typing indicator based on final state
    const existingIndicator = bubble.querySelector('.typing-indicator');
    if (!isFinal && !existingIndicator) {
      // Add typing indicator if this is still partial and doesn't have one
      const typingIndicator = document.createElement('span');
      typingIndicator.className = 'typing-indicator';
      bubble.appendChild(typingIndicator);
    } else if (isFinal && existingIndicator) {
      // Remove typing indicator if this is now final
      existingIndicator.remove();
    }
    
    // Update timestamp for final messages
    if (isFinal) {
      const timestampElement = bubble.querySelector('.message-timestamp');
      if (timestampElement) {
        const messageTime = timestamp || new Date();
        timestampElement.textContent = messageTime.toLocaleTimeString();
      }
    }
    
    // Update final state
    bubble.classList.toggle('partial', !isFinal);
    bubble.classList.toggle('final', isFinal);
  }
  
  // Auto-scroll to bottom
  conversationTranscript.scrollTop = conversationTranscript.scrollHeight;
  
  // Clean up old bubbles (keep last 100 to prevent memory issues)
  const bubbles = conversationTranscript.querySelectorAll('.speech-bubble');
  if (bubbles.length > 100) {
    const oldestBubble = bubbles[0] as HTMLDivElement;
    const oldSegmentId = oldestBubble.getAttribute('data-segment-id');
    if (oldSegmentId) {
      speechBubbles.delete(oldSegmentId);
    }
    oldestBubble.remove();
  }
}

// Panel button handlers
function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function toggleMicrophone() {
  state.screenShare.microphoneEnabled = !state.screenShare.microphoneEnabled;
  updateDebugStatus(`Microphone ${state.screenShare.microphoneEnabled ? 'enabled' : 'disabled'}`);
  
  // Restart audio monitoring if inputs are connected
  if (state.screenShare.inputsConnected) {
    startAudioLevelMonitoring();
  }
  updatePanelButtonStates();
}

function toggleComputerAudio() {
  // Don't allow toggle if voice mode
  if (state.assistantMode === 'voice') {
    updateDebugStatus("Computer audio not available in voice mode");
    return;
  }
  
  state.screenShare.computerAudioEnabled = !state.screenShare.computerAudioEnabled;
  updateDebugStatus(`Computer audio ${state.screenShare.computerAudioEnabled ? 'enabled' : 'disabled'}`);
  
  // Track user preference when in text mode
  if (state.assistantMode === 'text') {
    state.screenShare.userDisabledComputerAudioInTextMode = !state.screenShare.computerAudioEnabled;
  }
  
  // Restart audio monitoring if inputs are connected
  if (state.screenShare.inputsConnected) {
    startAudioLevelMonitoring();
  }
  updatePanelButtonStates();
}

function toggleScreenShare() {
  state.screenShare.computerVideoEnabled = !state.screenShare.computerVideoEnabled;
  updateDebugStatus(`Screen share ${state.screenShare.computerVideoEnabled ? 'enabled' : 'disabled'}`);
  updatePanelButtonStates();
}

function updatePanelButtonStates() {
  // Update microphone button
  if (panelMicBtn) {
    panelMicBtn.classList.toggle('off', !state.screenShare.microphoneEnabled);
    panelMicBtn.title = `Microphone: ${state.screenShare.microphoneEnabled ? 'On' : 'Off'}`;
  }
  
  // Update computer audio button
  if (panelAudioBtn) {
    const isDisabled = state.assistantMode === 'voice';
    panelAudioBtn.classList.toggle('off', !state.screenShare.computerAudioEnabled);
    panelAudioBtn.classList.toggle('disabled', isDisabled);
    
    if (isDisabled) {
      panelAudioBtn.title = "Computer Audio: Not available in voice mode";
    } else {
      panelAudioBtn.title = `Computer Audio: ${state.screenShare.computerAudioEnabled ? 'On' : 'Off'}`;
    }
  }
  
  // Update screen share button
  if (panelScreenBtn) {
    panelScreenBtn.classList.toggle('off', !state.screenShare.computerVideoEnabled);
    panelScreenBtn.title = `Screen Share: ${state.screenShare.computerVideoEnabled ? 'On' : 'Off'}`;
  }
  
  // Update recording button
  if (panelRecordBtn) {
    panelRecordBtn.classList.toggle('recording', state.isRecording);
    panelRecordBtn.title = state.isRecording ? 'Stop Recording' : 'Start Recording';
  }
}

// Settings Panel Functions
function updateSettingsAudioBarStates() {
  const isConnected = state.screenShare.inputsConnected;
  
  // Update microphone bar
  if (settingsMicrophoneLevelBar) {
    if (isConnected) {
      settingsMicrophoneLevelBar.classList.remove('disconnected');
    } else {
      settingsMicrophoneLevelBar.classList.add('disconnected');
    }
  }
  
  // Update computer audio bar
  if (settingsComputerAudioLevelBar) {
    if (isConnected) {
      settingsComputerAudioLevelBar.classList.remove('disconnected');
    } else {
      settingsComputerAudioLevelBar.classList.add('disconnected');
    }
  }
}

function toggleSettingsPanel() {
  if (settingsPanel) {
    const isHidden = settingsPanel.classList.contains('hidden');
    if (isHidden) {
      showSettingsPanel();
    } else {
      hideSettingsPanel();
    }
  }
}

function showSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.classList.remove('hidden');
    // Sync settings with current values
    syncSettingsValues();
    updatePanelGroupVisibility();
    updateDebugStatus("Settings panel opened");
  }
}

function hideSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.classList.add('hidden');
    updatePanelGroupVisibility();
    updateDebugStatus("Settings panel closed");
  }
}

function switchSettingsTab(tabName: string) {
  // Update tab buttons
  if (displayTab && inputsTab) {
    displayTab.classList.toggle('active', tabName === 'display');
    inputsTab.classList.toggle('active', tabName === 'inputs');
  }
  
  // Update tab content
  if (displayContent && inputsContent) {
    displayContent.classList.toggle('active', tabName === 'display');
    inputsContent.classList.toggle('active', tabName === 'inputs');
  }
  
  updateDebugStatus(`Switched to ${tabName} settings tab`);
}

function syncSettingsValues() {
  // Sync theme toggle
  if (settingsThemeToggle && themeToggleBtn) {
    settingsThemeToggle.textContent = themeToggleBtn.textContent;
  }
  
  // Sync opacity slider
  if (settingsOpacitySlider && settingsOpacityValue && opacitySlider && opacityValue) {
    settingsOpacitySlider.value = opacitySlider.value;
    settingsOpacityValue.textContent = opacityValue.textContent;
  }
  
  // Sync screen dropdown
  if (settingsScreenDropdown && screenSourceDropdown) {
    settingsScreenDropdown.innerHTML = screenSourceDropdown.innerHTML;
    settingsScreenDropdown.value = screenSourceDropdown.value;
  }
  
  // Sync screen preview
  if (settingsScreenPreview && screenPreviewContainer) {
    settingsScreenPreview.innerHTML = screenPreviewContainer.innerHTML;
  }
  
  // Sync inputs status
  if (settingsInputsStatus && inputsStatus) {
    settingsInputsStatus.textContent = state.screenShare.inputsConnected ? "Connected" : "Not connected";
    settingsInputsStatus.className = state.screenShare.inputsConnected ? "inputs-status-compact connected" : "inputs-status-compact";
  }
  
  // Sync connect button
  if (settingsConnectBtn) {
    settingsConnectBtn.textContent = state.screenShare.inputsConnected ? "Disconnect Inputs" : "Connect Inputs";
  }
  
  // Sync debug button toggle
  if (settingsDebugButtonToggle) {
    settingsDebugButtonToggle.checked = state.showDebugButton;
  }
}



// Agent type change handler
function handleAgentTypeChange(agentType: string) {
  state.agentType = agentType;
  const config = AGENT_TYPE_CONFIGS[agentType];
  
  if (config) {
    // Update derived state from agent config
    state.assistantMode = config.mode;
    state.systemPrompt = config.systemPrompt;
    state.taggedHintsEnabled = config.taggedHintsEnabled;
    
    // Update screen share settings based on agent config
    state.screenShare.microphoneEnabled = config.microphoneEnabled;
    state.screenShare.computerAudioEnabled = config.computerAudioEnabled;
    state.screenShare.computerVideoEnabled = config.computerVideoEnabled;
    
    updateDebugStatus(`Agent type changed to: ${agentType}`);
    
    // Restart audio monitoring if inputs are connected
    if (state.screenShare.inputsConnected) {
      startAudioLevelMonitoring();
    }
    
    // Update UI to reflect changes
    updateUI();
    updatePanelButtonStates();
    
    // Update output panel content if it's visible
    if (outputPanel && !outputPanel.classList.contains('hidden')) {
      updateOutputPanelContent();
    }
  }
}

function setupEventListeners() {
  updateDebugStatus("Setting up event listeners...");

  // Find elements
  browserLoginBtn = document.getElementById("browser-login-btn") as HTMLButtonElement;
  minimizeBtn = document.getElementById("minimize-btn") as HTMLButtonElement;
  closePanelBtn = document.getElementById("close-panel-btn") as HTMLButtonElement;
  tokenDisplay = document.getElementById("token-display") as HTMLSpanElement;

  // Panel elements
  loginControls = document.querySelector(".login-controls") as HTMLDivElement;
  recordingControls = document.querySelector(".recording-controls") as HTMLDivElement;
  panelRecordBtn = document.getElementById("panel-record-btn") as HTMLButtonElement;
  panelAgentDropdown = document.getElementById("panel-agent-dropdown") as HTMLSelectElement;
  panelTimer = document.getElementById("panel-timer") as HTMLSpanElement;
  panelMicBtn = document.getElementById("panel-mic-btn") as HTMLButtonElement;
  panelAudioBtn = document.getElementById("panel-audio-btn") as HTMLButtonElement;
  panelScreenBtn = document.getElementById("panel-screen-btn") as HTMLButtonElement;
  panelSettingsBtn = document.getElementById("panel-settings-btn") as HTMLButtonElement;
  panelDebugBtn = document.getElementById("panel-debug-btn") as HTMLButtonElement;

  // Settings panel elements
  settingsPanel = document.getElementById("settings-panel") as HTMLDivElement;
  closeSettingsBtn = document.getElementById("close-settings-btn") as HTMLButtonElement;
  displayTab = document.getElementById("display-tab") as HTMLButtonElement;
  inputsTab = document.getElementById("inputs-tab") as HTMLButtonElement;
  displayContent = document.getElementById("display-content") as HTMLDivElement;
  inputsContent = document.getElementById("inputs-content") as HTMLDivElement;
  settingsThemeToggle = document.getElementById("settings-theme-toggle") as HTMLButtonElement;
  settingsOpacitySlider = document.getElementById("settings-opacity-slider") as HTMLInputElement;
  settingsOpacityValue = document.getElementById("settings-opacity-value") as HTMLSpanElement;
  settingsScreenDropdown = document.getElementById("settings-screen-dropdown") as HTMLSelectElement;
  settingsScreenPreview = document.getElementById("settings-screen-preview") as HTMLDivElement;
  settingsConnectBtn = document.getElementById("settings-connect-btn") as HTMLButtonElement;
  settingsInputsStatus = document.getElementById("settings-inputs-status") as HTMLSpanElement;
  settingsMicrophoneLevel = document.getElementById("settings-microphone-level") as HTMLDivElement;
  settingsComputerAudioLevel = document.getElementById("settings-computer-audio-level") as HTMLDivElement;
  settingsMicrophoneLevelBar = settingsMicrophoneLevel?.parentElement as HTMLDivElement;
  settingsComputerAudioLevelBar = settingsComputerAudioLevel?.parentElement as HTMLDivElement;
  settingsDebugButtonToggle = document.getElementById("settings-debug-button-toggle") as HTMLInputElement;
  recordingStatus = document.getElementById("recording-status") as HTMLDivElement;
  livekitStatus = document.getElementById("livekit-status") as HTMLDivElement;
  requestPermissionsBtn = document.getElementById("request-permissions-btn") as HTMLButtonElement;
  refreshPermissionsBtn = document.getElementById("refresh-permissions-btn") as HTMLButtonElement;
  micStatus = document.getElementById("mic-status") as HTMLSpanElement;
  screenStatus = document.getElementById("screen-status") as HTMLSpanElement;
  audioStatus = document.getElementById("audio-status") as HTMLSpanElement;
  opacitySlider = document.getElementById("opacity-slider") as HTMLInputElement;
  opacityValue = document.getElementById("opacity-value") as HTMLSpanElement;
  closeBtn = document.getElementById("close-btn") as HTMLButtonElement;
  themeToggleBtn = document.getElementById("theme-toggle-btn") as HTMLButtonElement;

  // Screen sharing elements
  microphoneToggle = document.getElementById("microphone-toggle") as HTMLInputElement;
  computerVideoToggle = document.getElementById("computer-video-toggle") as HTMLInputElement;
  computerAudioToggle = document.getElementById("computer-audio-toggle") as HTMLInputElement;
  screenSourceDropdown = document.getElementById("screen-source-dropdown") as HTMLSelectElement;
  refreshScreensBtn = document.getElementById("refresh-screens-btn") as HTMLButtonElement;
  screenPreviewContainer = document.getElementById("screen-preview-container") as HTMLDivElement;
  connectInputsBtn = document.getElementById("connect-inputs-btn") as HTMLButtonElement;
  disconnectInputsBtn = document.getElementById("disconnect-inputs-btn") as HTMLButtonElement;
  inputsStatus = document.getElementById("inputs-status") as HTMLDivElement;

  // Audio level indicators
  microphoneLevelBar = document.getElementById("microphone-level") as HTMLDivElement;
  computerAudioLevelBar = document.getElementById("computer-audio-level") as HTMLDivElement;

  // Agent type elements
  agentTypeDropdown = document.getElementById("agent-type-dropdown") as HTMLSelectElement;
  conversationTranscript = document.getElementById("conversation-transcript") as HTMLDivElement;
  textResponseDisplay = document.getElementById("text-response-display") as HTMLDivElement;
  textResponseSection = document.querySelector(".text-response-section") as HTMLDivElement;

  // Tagged hints elements
  importanceSlider = document.getElementById("importance-slider") as HTMLInputElement;
  importanceSliderSection = document.getElementById("importance-slider-section") as HTMLDivElement;

  // Panel group and panel elements
  panelGroup = document.getElementById("panel-group") as HTMLDivElement;
  transcriptPanel = document.getElementById("transcript-panel") as HTMLDivElement;
  closeTranscriptBtn = document.getElementById("close-transcript-btn") as HTMLButtonElement;
  showTranscriptBtn = document.getElementById("show-transcript-btn") as HTMLButtonElement;
  outputPanel = document.getElementById("output-panel") as HTMLDivElement;
  closeOutputBtn = document.getElementById("close-output-btn") as HTMLButtonElement;
  outputPanelTitle = document.getElementById("output-panel-title") as HTMLSpanElement;
  textModeContent = document.getElementById("text-mode-content") as HTMLDivElement;
  hintModeContent = document.getElementById("hint-mode-content") as HTMLDivElement;
  voiceModeContent = document.getElementById("voice-mode-content") as HTMLDivElement;
  textResponsesContainer = document.getElementById("text-responses-container") as HTMLDivElement;
  hintsContainer = document.getElementById("hints-container") as HTMLDivElement;
  outputImportanceSlider = document.getElementById("output-importance-slider") as HTMLInputElement;

  // Debug panel elements
  debugPanel = document.getElementById("debug-panel") as HTMLDivElement;
  closeDebugBtn = document.getElementById("close-debug-btn") as HTMLButtonElement;

  updateDebugStatus(`Found: browserLogin=${!!browserLoginBtn} minimize=${!!minimizeBtn} closePanel=${!!closePanelBtn} permissions=${!!requestPermissionsBtn} refresh=${!!refreshPermissionsBtn} screenShare=${!!screenSourceDropdown} audioLevels=${!!microphoneLevelBar} connect=${!!connectInputsBtn} disconnect=${!!disconnectInputsBtn} agentType=${!!agentTypeDropdown} conversation=${!!conversationTranscript} textResponse=${!!textResponseDisplay} textResponseSection=${!!textResponseSection} importance=${!!importanceSlider} outputPanel=${!!outputPanel} debugPanel=${!!debugPanel}`);

  // Set up event listeners
  if (browserLoginBtn) {
    browserLoginBtn.addEventListener("click", handleLogin);
  }

  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", handleMinimizeWindow);
  }

  if (closePanelBtn) {
    closePanelBtn.addEventListener("click", handleCloseWindow);
  }

  // Panel event listeners
  if (panelRecordBtn) {
    panelRecordBtn.addEventListener("click", toggleRecording);
  }

  if (panelAgentDropdown) {
    panelAgentDropdown.addEventListener("change", (e) => {
      const selectedAgentType = (e.target as HTMLSelectElement).value;
      handleAgentTypeChange(selectedAgentType);
      // Sync with main dropdown
      if (agentTypeDropdown) {
        agentTypeDropdown.value = selectedAgentType;
      }
    });
  }

  if (panelMicBtn) {
    panelMicBtn.addEventListener("click", toggleMicrophone);
  }

  if (panelAudioBtn) {
    panelAudioBtn.addEventListener("click", toggleComputerAudio);
  }

  if (panelScreenBtn) {
    panelScreenBtn.addEventListener("click", toggleScreenShare);
  }

  if (panelSettingsBtn) {
    panelSettingsBtn.addEventListener("click", () => {
      toggleSettingsPanel();
    });
  }

  if (panelDebugBtn) {
    panelDebugBtn.addEventListener("click", () => {
      toggleDebugPanel();
    });
  }

  // Debug panel event listeners
  if (closeDebugBtn) {
    closeDebugBtn.addEventListener("click", () => {
      hideDebugPanel();
      // Also disable debug mode to hide the red border
      toggleDebugMode();
    });
  }



  if (requestPermissionsBtn) {
    requestPermissionsBtn.addEventListener("click", () => {
      updateDebugStatus("PERMISSIONS BUTTON CLICKED!");
      requestPermissions();
    });
  }

  if (refreshPermissionsBtn) {
    refreshPermissionsBtn.addEventListener("click", () => {
      updateDebugStatus("REFRESH BUTTON CLICKED!");
      refreshPermissions();
    });
  }



  if (opacitySlider) {
    opacitySlider.addEventListener("input", handleOpacityChange);
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", handleCloseWindow);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }

  // Screen sharing event listeners
  if (microphoneToggle) {
    microphoneToggle.addEventListener("change", (e) => {
      state.screenShare.microphoneEnabled = (e.target as HTMLInputElement).checked;
      updateDebugStatus(`Microphone ${state.screenShare.microphoneEnabled ? 'enabled' : 'disabled'}`);
      
      // Restart audio monitoring if inputs are connected
      if (state.screenShare.inputsConnected) {
        startAudioLevelMonitoring();
      }
    });
  }

  if (computerVideoToggle) {
    computerVideoToggle.addEventListener("change", (e) => {
      state.screenShare.computerVideoEnabled = (e.target as HTMLInputElement).checked;
      updateDebugStatus(`Computer video ${state.screenShare.computerVideoEnabled ? 'enabled' : 'disabled'}`);
    });
  }

  if (computerAudioToggle) {
    computerAudioToggle.addEventListener("change", (e) => {
      const isEnabled = (e.target as HTMLInputElement).checked;
      state.screenShare.computerAudioEnabled = isEnabled;
      updateDebugStatus(`Computer audio ${isEnabled ? 'enabled' : 'disabled'}`);
      
      // Track user preference when in text mode
      if (state.assistantMode === 'text') {
        state.screenShare.userDisabledComputerAudioInTextMode = !isEnabled;
      }
      
      // Restart audio monitoring if inputs are connected
      if (state.screenShare.inputsConnected) {
        startAudioLevelMonitoring();
      }
    });
  }

  if (screenSourceDropdown) {
    screenSourceDropdown.addEventListener("change", (e) => {
      const selectedId = (e.target as HTMLSelectElement).value;
      state.screenShare.selectedScreenId = selectedId || null;
      updateScreenPreview();
      
      if (selectedId) {
        startScreenPreviewTimer();
        updateDebugStatus(`Screen source selected: ${selectedId}`);
      } else {
        stopScreenPreviewTimer();
        updateDebugStatus(`Screen source deselected`);
      }
    });
  }

  if (refreshScreensBtn) {
    refreshScreensBtn.addEventListener("click", loadScreenSources);
  }

  if (connectInputsBtn) {
    connectInputsBtn.addEventListener("click", connectInputs);
  }

  if (disconnectInputsBtn) {
    disconnectInputsBtn.addEventListener("click", disconnectInputs);
  }

  // Agent type dropdown event listener
  if (agentTypeDropdown) {
    agentTypeDropdown.addEventListener("change", (e) => {
      const selectedAgentType = (e.target as HTMLSelectElement).value;
      handleAgentTypeChange(selectedAgentType);
    });
  }

  // Importance slider event listener
  if (importanceSlider) {
    importanceSlider.addEventListener("input", (e) => {
      const level = parseInt((e.target as HTMLInputElement).value);
      state.importanceLevel = level;
      updateDebugStatus(`Importance level changed to: ${level}`);
      
      // Update hints display if tagged hints are enabled
      if (state.taggedHintsEnabled) {
        updateHintsDisplay();
      }
    });
  }

  // Transcript panel event listeners
  if (showTranscriptBtn) {
    showTranscriptBtn.addEventListener("click", showTranscriptPanel);
  }

  if (closeTranscriptBtn) {
    closeTranscriptBtn.addEventListener("click", hideTranscriptPanel);
  }

  // Output panel event listeners
  if (closeOutputBtn) {
    closeOutputBtn.addEventListener("click", () => {
      if (!state.isRecording) {
        hideOutputPanel();
      }
      // If recording is active, the button should be disabled anyway
    });
  }

  if (outputImportanceSlider) {
    outputImportanceSlider.addEventListener("input", (e) => {
      const level = parseInt((e.target as HTMLInputElement).value);
      state.importanceLevel = level;
      updateDebugStatus(`Output importance level changed to: ${level}`);
      
      // Sync with main importance slider
      if (importanceSlider) {
        importanceSlider.value = level.toString();
      }
      
      // Update hints display if tagged hints are enabled
      if (state.taggedHintsEnabled) {
        updateOutputPanelHints();
      }
    });
  }

  // Settings panel event listeners
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", hideSettingsPanel);
  }

  if (displayTab) {
    displayTab.addEventListener("click", () => switchSettingsTab('display'));
  }

  if (inputsTab) {
    inputsTab.addEventListener("click", () => switchSettingsTab('inputs'));
  }

  if (settingsThemeToggle) {
    settingsThemeToggle.addEventListener("click", () => {
      toggleTheme();
      // Update the settings theme toggle text to match main toggle
      if (themeToggleBtn) {
        settingsThemeToggle.textContent = themeToggleBtn.textContent;
      }
    });
  }

  if (settingsOpacitySlider) {
    settingsOpacitySlider.addEventListener("input", () => {
      // Sync with main opacity slider
      if (opacitySlider) {
        opacitySlider.value = settingsOpacitySlider.value;
        handleOpacityChange();
        // Update the settings opacity value to match main value
        if (settingsOpacityValue && opacityValue) {
          settingsOpacityValue.textContent = opacityValue.textContent;
        }
      }
    });
  }

  if (settingsScreenDropdown) {
    settingsScreenDropdown.addEventListener("change", () => {
      // Sync with main screen dropdown
      if (screenSourceDropdown) {
        screenSourceDropdown.value = settingsScreenDropdown.value;
        // Trigger the main dropdown's change event
        const event = new Event('change');
        screenSourceDropdown.dispatchEvent(event);
      }
    });
  }

  if (settingsConnectBtn) {
    settingsConnectBtn.addEventListener("click", () => {
      if (state.screenShare.inputsConnected) {
        disconnectInputs();
      } else {
        connectInputs();
      }
    });
  }

  if (settingsDebugButtonToggle) {
    settingsDebugButtonToggle.addEventListener("change", (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      state.showDebugButton = isChecked;
      updateDebugButtonVisibility();
    });
  }

  if (requestPermissionsBtn && refreshPermissionsBtn && agentTypeDropdown && importanceSlider && browserLoginBtn && minimizeBtn && closePanelBtn) {
    updateDebugStatus("✅ All event listeners added successfully");
  } else {
    updateDebugStatus("❌ Some buttons not found!");
  }
  
  // Initialize debug button visibility after elements are found
  updateDebugButtonVisibility();
}

// Authentication handling
async function handleLogin() {
  try {
    if (window.electronAPI) {
      await window.electronAPI.openAuthUrl();
      updateDebugStatus("Auth URL opened via Electron");
    } else {
      updateDebugStatus("❌ Electron API not available");
    }
  } catch (error) {
    console.error("Failed to open auth URL:", error);
    updateDebugStatus(`❌ Auth failed: ${error}`);
  }
}

// Test login function for debugging
function testLogin() {
  updateDebugStatus('Test login triggered');
  handleLoginComplete('test-token-manual');
}

// Setup deep link handling for Electron
function setupDeepLinkHandling() {
  if (window.electronAPI) {
    updateDebugStatus("Setting up Electron deep link handling...");

    window.electronAPI.onLoginComplete((token: string) => {
      updateDebugStatus(`🔗 Received deep link token: ${token}`);
      handleLoginComplete(token);
    });

    updateDebugStatus("✅ Electron deep link handler registered");
  } else {
    updateDebugStatus("❌ Electron API not available for deep links");
  }

  // Also listen for protocol URLs from Vite dev server (for development mode)
  if (import.meta.hot) {
    updateDebugStatus("Setting up Vite HMR protocol URL handling...");

    import.meta.hot.on('protocol-url', (data) => {
      updateDebugStatus(`🔗 Received protocol URL from Vite: ${data.url}`);
      handleProtocolUrl(data.url);
    });

    updateDebugStatus("✅ Vite protocol URL handler registered");
  }
}

function handleProtocolUrl(url: string) {
  updateDebugStatus(`Processing protocol URL: ${url}`);

  try {
    // Decode the URL in case it's been URL-encoded
    const decodedUrl = decodeURIComponent(url);
    updateDebugStatus(`Decoded URL: ${decodedUrl}`);

    // Custom protocol URLs don't parse correctly with URL constructor
    // So we'll manually parse livekit-recorder://auth/callback?token=...
    const protocolMatch = decodedUrl.match(/^livekit-recorder:\/\/([^\/]+)(\/[^?]*)?(\?.*)?$/);

    if (protocolMatch) {
      const hostname = protocolMatch[1];
      const pathname = protocolMatch[2] || '';
      const search = protocolMatch[3] || '';

      updateDebugStatus(`Parsed - Host: ${hostname}, Path: ${pathname}, Search: ${search}`);

      if (hostname === 'auth' && pathname === '/callback') {
        // Extract token from search params
        const searchParams = new URLSearchParams(search);
        const token = searchParams.get('token');

        if (token) {
          // Decode the token in case it's also URL-encoded
          const decodedToken = decodeURIComponent(token);
          updateDebugStatus(`🎟️ Extracted token: ${decodedToken}`);
          handleLoginComplete(decodedToken);
        } else {
          updateDebugStatus(`❌ No token found in search params: ${search}`);
        }
      } else {
        updateDebugStatus(`❌ Invalid path/host - Expected auth/callback, got ${hostname}${pathname}`);
      }
    } else {
      updateDebugStatus(`❌ URL doesn't match expected pattern: ${decodedUrl}`);
    }
  } catch (error) {
    updateDebugStatus(`❌ Error parsing protocol URL: ${error}`);
  }
}

function handleLoginComplete(token: string) {
  updateDebugStatus(`🎉 handleLoginComplete called with token: ${token}`);
  state.isLoggedIn = true;
  state.authToken = token;
  updateDebugStatus(`🔄 State updated, isLoggedIn: ${state.isLoggedIn}, token stored`);
  updateUI();
  updateDebugStatus(`✅ Login successful with token stored`);
  
  // Fetch remaining tokens on login
  fetchRemainingTokens();
}

// Permission handling - use Electron APIs
async function requestPermissions() {
  updateDebugStatus("🔥 Requesting permissions via Electron...");

  try {
    if (window.electronAPI) {
      updateDebugStatus("🔐 Calling Electron API for permissions...");
      const result = await window.electronAPI.requestSystemPermissions();

      updateDebugStatus("✅ Electron API response received");
      alert(result);

      // After a short delay, check the actual permission status
      updateDebugStatus("🔍 Checking permission status...");
      setTimeout(async () => {
        await checkPermissionStatus();
      }, 2000);
    } else {
      updateDebugStatus("❌ Electron API not available");
      alert("Permission management requires Electron environment");
    }
  } catch (error: any) {
    updateDebugStatus(`❌ Electron API error: ${error}`);
    alert(`Permission request failed: ${error}`);
  }
}

// Function to check current permission status from Electron
async function checkPermissionStatus() {
  try {
    updateDebugStatus("🔍 Checking current permission status...");

    if (window.electronAPI) {
      const permissions = await window.electronAPI.checkPermissions();

      // Update state with actual permission status
      state.permissions.microphone = permissions.microphone || false;
      state.permissions.screen = permissions.screen || false;
      state.permissions.audio = permissions.audio || false;

      updateDebugStatus(`✅ Permissions: Mic=${permissions.microphone} Screen=${permissions.screen} Audio=${permissions.audio}`);

      // Show debug info if available
      if (permissions.debug) {
        console.log("Permission debug info:", permissions.debug);
        updateDebugStatus(`Debug: Platform=${permissions.debug.platform} MicStatus=${permissions.debug.micStatus} ScreenStatus=${permissions.debug.screenStatus}`);
      }

      // Update UI to reflect actual permissions
      updateUI();
    } else {
      updateDebugStatus("❌ Electron API not available for permission check");
    }

  } catch (error: any) {
    updateDebugStatus(`❌ Permission check failed: ${error}`);
  }
}

// Add a button to manually refresh permission status
function refreshPermissions() {
  updateDebugStatus("🔄 Refreshing permission status...");
  checkPermissionStatus();
}

// Window control handling
async function handleCloseWindow() {
  try {
    if (window.electronAPI) {
      await window.electronAPI.closeWindow();
    }
  } catch (error) {
    console.error("Failed to close window:", error);
  }
}

async function handleMinimizeWindow() {
  try {
    if (window.electronAPI) {
      await window.electronAPI.minimizeWindow();
    }
  } catch (error) {
    console.error("Failed to minimize window:", error);
  }
}

// Opacity handling
async function handleOpacityChange() {
  const opacity = parseFloat(opacitySlider.value);
  opacityValue.textContent = `${Math.round(opacity * 100)}%`;

  try {
    if (window.electronAPI) {
      await window.electronAPI.setWindowOpacity(opacity);
      updateDebugStatus(`🔄 Opacity set to ${Math.round(opacity * 100)}%`);
    } else {
      updateDebugStatus("❌ Electron API not available for opacity");
    }
  } catch (error) {
    console.error("Failed to set window opacity:", error);
    updateDebugStatus(`❌ Opacity failed: ${error}`);
  }
}

// Persistent room connection (keeps room alive for agent)
// Screen sharing functionality
async function loadScreenSources() {
  try {
    updateDebugStatus("🖥️ Loading screen sources...");
    
    if (!window.electronAPI?.getScreenSources) {
      throw new Error("Screen source API not available");
    }

    const sources = await window.electronAPI.getScreenSources();
    state.screenShare.availableScreens = sources;
    
    // Update dropdown
    if (screenSourceDropdown) {
      screenSourceDropdown.innerHTML = '';
      
      if (sources.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No screens available';
        screenSourceDropdown.appendChild(option);
      } else {
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a screen...';
        screenSourceDropdown.appendChild(defaultOption);
        
        // Add screen options
        sources.forEach(source => {
          const option = document.createElement('option');
          option.value = source.id;
          option.textContent = source.name;
          screenSourceDropdown.appendChild(option);
        });
        
        // Auto-select first screen if available
        if (sources.length > 0 && !state.screenShare.selectedScreenId) {
          state.screenShare.selectedScreenId = sources[0].id;
          screenSourceDropdown.value = sources[0].id;
          updateScreenPreview();
          startScreenPreviewTimer();
        }
      }
    }
    
    updateDebugStatus(`✅ Loaded ${sources.length} screen sources`);
  } catch (error) {
    console.error('Failed to load screen sources:', error);
    updateDebugStatus(`❌ Failed to load screen sources: ${error}`);
  }
}

function updateScreenPreview() {
  if (!screenPreviewContainer) return;
  
  const selectedScreen = state.screenShare.availableScreens.find(
    screen => screen.id === state.screenShare.selectedScreenId
  );
  
  if (selectedScreen) {
    screenPreviewContainer.innerHTML = `
      <img src="${selectedScreen.thumbnail}" alt="${selectedScreen.name}" />
    `;
  } else {
    screenPreviewContainer.innerHTML = '<div class="preview-placeholder">No screen selected</div>';
  }
}

async function refreshScreenPreview() {
  if (!state.screenShare.selectedScreenId || !window.electronAPI?.getScreenSources) {
    return;
  }

  try {
    const sources = await window.electronAPI.getScreenSources();
    const selectedScreen = sources.find(screen => screen.id === state.screenShare.selectedScreenId);
    
    if (selectedScreen && screenPreviewContainer) {
      screenPreviewContainer.innerHTML = `
        <img src="${selectedScreen.thumbnail}" alt="${selectedScreen.name}" />
      `;
    }
  } catch (error) {
    console.error('Failed to refresh screen preview:', error);
  }
}

function startScreenPreviewTimer() {
  // Clear existing timer
  if (screenPreviewTimer) {
    clearInterval(screenPreviewTimer);
  }

  // Only start timer if a screen is selected
  if (state.screenShare.selectedScreenId) {
    screenPreviewTimer = setInterval(refreshScreenPreview, 1000) as unknown as number;
    updateDebugStatus("🔄 Screen preview auto-refresh started");
  }
}

function stopScreenPreviewTimer() {
  if (screenPreviewTimer) {
    clearInterval(screenPreviewTimer);
    screenPreviewTimer = null;
    updateDebugStatus("⏹️ Screen preview auto-refresh stopped");
  }
}

// Audio level monitoring using Web Audio API
function getAudioLevel(analyzer: AnalyserNode): number {
  const bufferLength = analyzer.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyzer.getByteFrequencyData(dataArray);
  
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  const average = sum / bufferLength;
  return average / 255; // Normalize to 0-1
}

function updateAudioLevels() {
  try {
    let micPercentage = 0;
    let computerPercentage = 0;
    
    // Calculate microphone level
    if (microphoneAnalyzer && state.screenShare.microphoneEnabled && state.screenShare.inputsConnected) {
      const micLevel = getAudioLevel(microphoneAnalyzer);
      micPercentage = Math.min(100, Math.max(0, micLevel * 100));
    }

    // Calculate computer audio level
    if (computerAudioAnalyzer && state.screenShare.computerAudioEnabled && state.screenShare.inputsConnected) {
      const computerLevel = getAudioLevel(computerAudioAnalyzer);
      computerPercentage = Math.min(100, Math.max(0, computerLevel * 100));
    }
    
    
    // Update hidden compatibility elements (for main app functionality)
    if (microphoneLevelBar) {
      microphoneLevelBar.style.width = `${micPercentage}%`;
    }
    if (computerAudioLevelBar) {
      computerAudioLevelBar.style.width = `${computerPercentage}%`;
    }
    
    // Update settings panel audio levels directly using CSS custom properties
    if (settingsMicrophoneLevel) {
      settingsMicrophoneLevel.style.setProperty('--audio-width', `${micPercentage}%`);
    }
    if (settingsComputerAudioLevel) {
      settingsComputerAudioLevel.style.setProperty('--audio-width', `${computerPercentage}%`);
    }
  } catch (error) {
    console.warn('Error updating audio levels:', error);
  }
}

async function setupAudioAnalyzers() {
  try {
    // Create audio context if needed
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Setup microphone analyzer
    if (state.audioTrack && state.screenShare.microphoneEnabled) {
      const micSource = audioContext.createMediaStreamSource(new MediaStream([state.audioTrack.mediaStreamTrack]));
      microphoneAnalyzer = audioContext.createAnalyser();
      microphoneAnalyzer.fftSize = 256;
      micSource.connect(microphoneAnalyzer);
      updateDebugStatus("🎤 Microphone audio analyzer setup");
    }

    // Setup computer audio analyzer
    if (state.screenAudioTrack && state.screenShare.computerAudioEnabled) {
      const computerSource = audioContext.createMediaStreamSource(new MediaStream([state.screenAudioTrack.mediaStreamTrack]));
      computerAudioAnalyzer = audioContext.createAnalyser();
      computerAudioAnalyzer.fftSize = 256;
      computerSource.connect(computerAudioAnalyzer);
      updateDebugStatus("🔊 Computer audio analyzer setup");
    }
  } catch (error) {
    console.warn('Error setting up audio analyzers:', error);
  }
}

function startAudioLevelMonitoring() {
  // Clear existing timer
  if (audioLevelTimer) {
    clearInterval(audioLevelTimer);
  }

  // Setup analyzers first
  setupAudioAnalyzers();

  // Start monitoring if we have connected tracks
  if ((state.audioTrack && state.screenShare.microphoneEnabled) || 
      (state.screenAudioTrack && state.screenShare.computerAudioEnabled)) {
    audioLevelTimer = setInterval(updateAudioLevels, 100) as unknown as number; // Update every 100ms
    updateDebugStatus("🔊 Audio level monitoring started");
  }
  
  // Update audio bar states to reflect connection status
  updateSettingsAudioBarStates();
}

function stopAudioLevelMonitoring() {
  if (audioLevelTimer) {
    clearInterval(audioLevelTimer);
    audioLevelTimer = null;
    updateDebugStatus("🔇 Audio level monitoring stopped");
  }
  
  // Clean up analyzers
  microphoneAnalyzer = null;
  computerAudioAnalyzer = null;
  
  // Reset visual indicators
  if (microphoneLevelBar) {
    microphoneLevelBar.style.width = '0%';
  }
  if (computerAudioLevelBar) {
    computerAudioLevelBar.style.width = '0%';
  }
  
  // Reset settings panel audio levels
  if (settingsMicrophoneLevel) {
    settingsMicrophoneLevel.style.setProperty('--audio-width', '0%');
  }
  if (settingsComputerAudioLevel) {
    settingsComputerAudioLevel.style.setProperty('--audio-width', '0%');
  }
  
  // Update audio bar states to show disconnected
  updateSettingsAudioBarStates();
}

async function connectInputs() {
  try {
    updateDebugStatus("🔌 Connecting inputs...");
    
    if (inputsStatus) {
      inputsStatus.textContent = "Connecting...";
      inputsStatus.className = "inputs-status";
    }
    
    // Clean up existing tracks
    if (state.audioTrack) {
      state.audioTrack.stop();
      state.audioTrack = null;
    }
    if (state.screenVideoTrack) {
      state.screenVideoTrack.stop();
      state.screenVideoTrack = null;
    }
    if (state.screenAudioTrack) {
      state.screenAudioTrack.stop();
      state.screenAudioTrack = null;
    }
    
    // Stop screen preview timer while reconnecting
    stopScreenPreviewTimer();
    
    // Stop audio level monitoring while reconnecting
    stopAudioLevelMonitoring();
    
    // Create microphone track if enabled
    if (state.screenShare.microphoneEnabled) {
      state.audioTrack = await createLocalAudioTrack({ // TODO: check if this is needed (might already be adjusted in livekit room)
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // deviceId?: ConstrainDOMString
      });
      updateDebugStatus("🎤 Microphone track created");
    }
    
    // Create PC video/audio tracks
    if (state.screenShare.computerAudioEnabled || (state.screenShare.computerVideoEnabled && state.screenShare.selectedScreenId)) {
      try {
        // Make a single getUserMedia call that requests both video and audio to avoid IPC conflicts in Electron
        const screenStream = await navigator.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: state.screenShare.selectedScreenId,
              maxWidth: 1920,
              maxHeight: 1080,
              maxFrameRate: 30 //VIDEO_FRAME_RATE
            }
          },
          audio: state.screenShare.computerAudioEnabled ? {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: state.screenShare.selectedScreenId,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          } : false,
          systemAudio: state.screenShare.computerAudioEnabled ? "include" : "exclude"
        } as unknown as MediaStreamConstraints);
        
        // Extract video track if enabled
        if (state.screenShare.computerVideoEnabled) {
          const videoTracks = screenStream.getVideoTracks();
          if (videoTracks.length > 0) {
            state.screenVideoTrack = new LocalVideoTrack(videoTracks[0], undefined, false);
            updateDebugStatus("🖥️ Screen video track created");
          }
        } else { 
          // Clean up video track if not needed
          const videoTracks = screenStream.getVideoTracks();
          videoTracks.forEach(track => track.stop());
          updateDebugStatus("🖥️ Screen video track stopped");
        }
        
        // Extract audio track if enabled  
        if (state.screenShare.computerAudioEnabled) {
          const audioTracks = screenStream.getAudioTracks();
          if (audioTracks.length > 0) {
            state.screenAudioTrack = new LocalAudioTrack(audioTracks[0], undefined, false);
            updateDebugStatus("🔊 Screen audio track created");
            console.log(JSON.stringify(audioTracks[0].getConstraints(), null, 2));
          }
        }
        
      } catch (error) {
        console.error('Failed to create screen tracks:', error);
        updateDebugStatus(`❌ Failed to create screen tracks: ${error}`);
      }
    }
    // }
    
    state.screenShare.inputsConnected = true;
    
    if (inputsStatus) {
      inputsStatus.textContent = "✅ Inputs connected";
      inputsStatus.className = "inputs-status connected";
    }
    
    // Update UI to reflect connected state
    updateUI();
    
    // Restart screen preview timer if screen is selected
    if (state.screenShare.selectedScreenId) {
      startScreenPreviewTimer();
    }
    
    // Start audio level monitoring
    startAudioLevelMonitoring();
    
    updateDebugStatus("✅ All inputs connected successfully");
    
  } catch (error) {
    console.error('Failed to connect inputs:', error);
    updateDebugStatus(`❌ Failed to connect inputs: ${error}`);
    
    if (inputsStatus) {
      inputsStatus.textContent = `❌ Connection failed: ${error.message}`;
      inputsStatus.className = "inputs-status error";
    }
    
    state.screenShare.inputsConnected = false;
  }
}

async function disconnectInputs() {
  try {
    updateDebugStatus("🔌 Disconnecting inputs...");
    
    if (inputsStatus) {
      inputsStatus.textContent = "Disconnecting...";
      inputsStatus.className = "inputs-status";
    }
    
    // Stop audio level monitoring
    stopAudioLevelMonitoring();
    
    // Clean up tracks
    if (state.audioTrack) {
      state.audioTrack.stop();
      state.audioTrack = null;
    }
    if (state.screenVideoTrack) {
      state.screenVideoTrack.stop();
      state.screenVideoTrack = null;
    }
    if (state.screenAudioTrack) {
      state.screenAudioTrack.stop();
      state.screenAudioTrack = null;
    }
    
    state.screenShare.inputsConnected = false;
    
    if (inputsStatus) {
      inputsStatus.textContent = "Inputs not connected";
      inputsStatus.className = "inputs-status";
    }
    
    updateUI();
    updateDebugStatus("✅ Inputs disconnected successfully");
    
  } catch (error) {
    console.error('Failed to disconnect inputs:', error);
    updateDebugStatus(`❌ Failed to disconnect inputs: ${error}`);
  }
}

async function connectPersistentRoom() {
  if (state.persistentRoom) return;

  state.persistentRoom = new Room();

  console.log("🔗 Creating persistent room connection...");

  const tokenUrl = `${authHost}/api/livekit/token`;

  let tokenResponse;
  try {
    const requestBody: any = {
      participantName: `persistent-${Date.now()}`
    };

    // Include auth token if available
    if (state.authToken) {
      requestBody.authToken = state.authToken;
      console.log("🔑 Including auth token in request");
    } else {
      console.log("⚠️ No auth token available, trying cookies only");
    }

    tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📡 Response status: ${tokenResponse.status} ${tokenResponse.statusText}`);
    console.log(`📡 Response ok: ${tokenResponse.ok}`);
    console.log(`📡 Response headers: ${JSON.stringify([...tokenResponse.headers.entries()])}`);

  } catch (fetchError) {
    console.log(`❌ Network error: ${fetchError}`);
    throw new Error(`Network error while fetching token: ${fetchError.message}`);
  }

  let tokenData;
    try {
      console.log(`🔍 Attempting to parse JSON response...`);
      tokenData = await tokenResponse.json();
      console.log(`✅ JSON parsed successfully`);
      console.log(`🎫 LiveKit token received for room: ${tokenData.roomName}`);
      console.log(`🔗 Server URL: ${tokenData.serverUrl}`);
      console.log(`👤 Participant: ${tokenData.participantName}`);
    } catch (jsonError) {
      console.log(`❌ Invalid JSON response: ${jsonError}`);
      // Let's also try to get the raw response text for debugging
      try {
        const rawText = await tokenResponse.text();
        console.log(`❌ Raw response: ${rawText}`);
      } catch (textError) {
        console.log(`❌ Could not read raw response: ${textError}`);
      }
      throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
    }

    console.log(`🔌 Connecting to LiveKit room...`);
    await state.persistentRoom.connect(tokenData.serverUrl, tokenData.token);
    console.log(`✅ Connected to LiveKit room successfully`);
}

// Recording functionality
async function startRecording() {
  updateDebugStatus("🎬 startRecording called");

  // Clear hints history for new call
  clearHintsHistory();

  // Clear text response history for new call
  textResponseHistory.length = 0;

  if (!state.isLoggedIn) {
    updateDebugStatus("❌ User not logged in, aborting recording");
    alert("Please login first");
    return;
  }

  if (!state.permissions.microphone || !state.permissions.screen) {
    updateDebugStatus("❌ Missing permissions, aborting recording");
    alert("Please grant required permissions first");
    return;
  }

  updateDebugStatus("✅ Pre-flight checks passed");
  
  // Fetch remaining tokens when starting conversation
  await fetchRemainingTokens();

  try {
    updateDebugStatus("🎬 Starting recording...");

    // Clean up any existing audio elements to prevent duplicates/echo
    document.querySelectorAll('audio').forEach(audio => audio.remove());

    // Create LiveKit room
    state.room = new Room();

    state.room.on(RoomEvent.Connected, () => {
      livekitStatus.textContent = "LiveKit: Connected";
      recordingStatus.textContent = "Recording in progress...";
      updateDebugStatus("✅ LiveKit connected");
    });

    state.room.on(RoomEvent.Disconnected, () => {
      livekitStatus.textContent = "LiveKit: Disconnected";
      recordingStatus.textContent = "Recording stopped";
      updateDebugStatus("📴 LiveKit disconnected");
    });

    // Track when other participants (like agents) join
    state.room.on(RoomEvent.ParticipantConnected, (participant) => {
      updateDebugStatus(`👤 Participant joined: ${participant.identity}`);
      console.log('👤 Participant connected:', {
        identity: participant.identity,
        kind: participant.kind,
        sid: participant.sid
      });
    });

    // Handle remote audio tracks (agent speech) - but NOT your own audio
    state.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === 'audio' && !participant.isLocal) {
        updateDebugStatus(`🔊 Audio track received from ${participant.identity}`);
        const audioElement = track.attach();
        audioElement.autoplay = true;
        audioElement.volume = 1.0;
        audioElement.setAttribute('data-participant', participant.identity);
        document.body.appendChild(audioElement);
      }
    });

    // Clean up audio elements when tracks are unsubscribed
    state.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === 'audio') {
        updateDebugStatus(`🔇 Audio track removed from ${participant.identity}`);
        const audioElements = document.querySelectorAll(`audio[data-participant="${participant.identity}"]`);
        audioElements.forEach(element => element.remove());
      }
    });

    // Handle data packets for text output from agent
    state.room.on(RoomEvent.DataReceived, (payload, participant) => {
      if (participant && !participant.isLocal) {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (data.type === 'agent_text_output') {
            // Display agent data message in conversation

            // Update the text response display with the latest model response
            updateTextResponse(data.text);

            // Don't display agent data messages in conversation for now
            // TODO: Add toggle to show/hide agent data messages in conversation
            // displayConversationMessage(
            //   data.text,
            //   `agent-data-${Date.now()}`,
            //   'assistant',
            //   true,
            //   participant.identity,
            //   new Date()
            // );
            updateDebugStatus(`📝 Agent text output: ${data.text}`);
          } else if (data.type === 'pc_audio_transcript') {
            displayConversationMessage(
              data.text,
              `agent-data-${Date.now()}`,
              'user-pc',
              true,
              participant.identity,
              new Date()
            );
            updateDebugStatus(`📝 PC audio transcript: ${data.text}`);
          } else {
            updateDebugStatus(`📝 Unknown data type: ${data.type}`);
            console.log('🔍 Data received:', data);
          }
        } catch (error) {
          console.warn('Failed to parse data packet:', error);
        }
      }
    });

    // Subscribe to audio transcriptions
    state.room.on(RoomEvent.TranscriptionReceived, (segments, participant, publication) => {
      // Process each segment individually, tracking latest version of each segment ID
      segments.forEach(segment => {
        const trackSource = publication?.source;
        const text = segment.text;
        const segmentId = segment.id;
        
        // Store/update the segment
        transcriptionSegments.set(segmentId, {
          text: text,
          final: segment.final,
          participant: participant?.identity || 'Unknown',
          trackSource: trackSource
        });

        // Log the transcription with detailed information
        if (!participant?.isLocal) {
          console.log('🎤 AGENT TRANSCRIPTION ...');
        } else if (trackSource === Track.Source.ScreenShareAudio) {
          console.log('💻 COMPUTER AUDIO TRANSCRIPTION:', {
          });
        } else if (trackSource === Track.Source.Microphone) {
          console.log('🎤 MICROPHONE TRANSCRIPTION ...');
        } else {
          console.log('🎤 UNKNOWN TRANSCRIPTION RECEIVED:', {
            participant: participant?.identity || 'Unknown',
            participantType: participant?.isLocal ? 'User' : 'Agent',
            isLocal: participant?.isLocal || false,
            trackSource: trackSource,
            text: text,
            id: segment.id,
            final: segment.final,
            publication: publication?.trackSid || 'Unknown track',
            timestamp: new Date().toISOString()
          });
        }

        // Display transcriptions in the conversation UI
        if (text.trim()) {
          // Determine participant type for conversation display
          let conversationParticipantType: 'user' | 'user-pc' | 'assistant' | 'assistant-transcript';
          if (participant?.isLocal) {
            // Local participant - check track source
            if (trackSource === Track.Source.ScreenShareAudio) {
              conversationParticipantType = 'user-pc';
            } else {
              conversationParticipantType = 'user';
            }
          } else {
            // Remote participant (agent)
            conversationParticipantType = 'assistant-transcript';
          }
          
          // Display the transcription message
          displayConversationMessage(
            text,
            segmentId,
            conversationParticipantType,
            segment.final,
            participant?.identity || 'Unknown',
            new Date()
          );
          if (segment.final) {
            updateDebugStatus(`📝 ${conversationParticipantType} text: ${text}`);
          }
        }
      });
    });

    
    // Check if inputs are already connected, if not, connect them
    if (!state.screenShare.inputsConnected) {
      updateDebugStatus("🔌 Inputs not connected, connecting now...");
      await connectInputs();
    }

    // Verify we have the required tracks
    if (!state.audioTrack && state.screenShare.microphoneEnabled) {
      throw new Error("Microphone track not available - please connect inputs first");
    }
    
    if (!state.screenVideoTrack && state.screenShare.computerVideoEnabled) {
      throw new Error("Screen video track not available - please connect inputs first");
    }

    updateDebugStatus(`🎥 Using connected tracks - Audio: ${!!state.audioTrack}, Screen Video: ${!!state.screenVideoTrack}, Screen Audio: ${!!state.screenAudioTrack}`);

    // Fetch LiveKit token from auth server
    updateDebugStatus("🔗 Fetching LiveKit token...");
    const tokenUrl = `${authHost}/api/livekit/token`;

    updateDebugStatus(`🌐 Making request to: ${tokenUrl}`);

    let tokenResponse;
    try {
      const requestBody: any = {
        participantName: `recorder-${Date.now()}`,
        assistantMode: state.assistantMode, // Include assistant mode preference
        systemPrompt: state.systemPrompt // Include system prompt preference
      };

      // Include auth token if available
      if (state.authToken) {
        requestBody.authToken = state.authToken;
        updateDebugStatus("🔑 Including auth token in request");
      } else {
        updateDebugStatus("⚠️ No auth token available, trying cookies only");
      }
      console.log("📤 Token request body:", JSON.stringify(requestBody, null, 2));

      tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      updateDebugStatus(`📡 Response status: ${tokenResponse.status} ${tokenResponse.statusText}`);
      updateDebugStatus(`📡 Response ok: ${tokenResponse.ok}`);
      updateDebugStatus(`📡 Response headers: ${JSON.stringify([...tokenResponse.headers.entries()])}`);

    } catch (fetchError) {
      updateDebugStatus(`❌ Network error: ${fetchError}`);
      throw new Error(`Network error while fetching token: ${fetchError.message}`);
    }

    if (!tokenResponse.ok) {
      let errorText = '';
      try {
        const errorBody = await tokenResponse.text();
        errorText = errorBody;
        updateDebugStatus(`❌ Server error response: ${errorText}`);
      } catch (e) {
        updateDebugStatus(`❌ Could not read error response`);
      }
      throw new Error(`Failed to fetch LiveKit token: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
    }

    let tokenData;
    try {
      updateDebugStatus(`🔍 Attempting to parse JSON response...`);
      tokenData = await tokenResponse.json();
      updateDebugStatus(`✅ JSON parsed successfully`);
      updateDebugStatus(`🎫 LiveKit token received for room: ${tokenData.roomName}`);
      updateDebugStatus(`🔗 Server URL: ${tokenData.serverUrl}`);
      updateDebugStatus(`👤 Participant: ${tokenData.participantName}`);

      console.log("📥 Token response data:", JSON.stringify(tokenData, null, 2));

    } catch (jsonError) {
      updateDebugStatus(`❌ Invalid JSON response: ${jsonError}`);
      // Let's also try to get the raw response text for debugging
      try {
        const rawText = await tokenResponse.text();
        updateDebugStatus(`❌ Raw response: ${rawText}`);
      } catch (textError) {
        updateDebugStatus(`❌ Could not read raw response: ${textError}`);
      }
      throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
    }

    updateDebugStatus(`🔌 Connecting to LiveKit room: ${tokenData.roomName}...`);
    console.log("🔌 Connecting to LiveKit with:", {
      serverUrl: tokenData.serverUrl,
      roomName: tokenData.roomName,
      participantName: tokenData.participantName,
      hasToken: !!tokenData.token
    });

    await state.room.connect(tokenData.serverUrl, tokenData.token);
    updateDebugStatus(`✅ Connected to LiveKit room successfully`);
    console.log("✅ Successfully connected to LiveKit room");

    // Publish tracks
    if (state.audioTrack) {
      updateDebugStatus(`📤 Publishing microphone track...`);
      await state.room.localParticipant.publishTrack(state.audioTrack, {
        name: 'mic-audio',
        source: Track.Source.Microphone,
        dtx: true,  // Enable DTX for microphone (usually mono)
        red: true   // Keep RED for better quality
      });
    }
    
    // Publish screen sharing tracks
    if (state.screenVideoTrack) {
      updateDebugStatus(`📤 Publishing screen video track...`);
      await state.room.localParticipant.publishTrack(state.screenVideoTrack, {
        name: 'pc-video',
        source: Track.Source.ScreenShare,
        ...VideoPresets.h1080,
        simulcast: false,
        videoEncoding: {
          ...VideoPresets.h1080.encoding,
          maxFramerate: VIDEO_FRAME_RATE
        }
      });
    }
    
    if (state.screenAudioTrack) {
      updateDebugStatus(`📤 Publishing screen audio track...`);
      await state.room.localParticipant.publishTrack(state.screenAudioTrack, {
        name: 'pc-audio',
        source: Track.Source.ScreenShareAudio,
        dtx: false, // Explicitly disable DTX for stereo screen audio
        red: true,  // Keep RED for better quality
      });
    }
    updateDebugStatus(`📤 All available tracks published successfully`);

    state.isRecording = true;
    
    // Start the timer
    startTimer();
    
    // Add system message for recording start
    addConversationSeparator(); // Add separator if there are existing messages
    addSystemMessage("Recording started");
    
    // Show output panel when recording starts
    showOutputPanel();
    
    updateUI();
    updateDebugStatus("✅ Recording started successfully");
  } catch (error) {
    console.error("Failed to start recording:", error);
    updateDebugStatus(`❌ Recording failed: ${error}`);
    
    // Add system message for recording failure if we had started
    if (state.isRecording) {
      addSystemMessage("Recording failed");
    }
    
    // Perform same cleanup as stopRecording() to ensure clean state
    await performRecordingCleanup();
    
    // Update UI to show error state
    recordingStatus.textContent = "Failed to start recording";
    livekitStatus.textContent = "LiveKit: Disconnected";
  }
}

async function performRecordingCleanup() {
  updateDebugStatus("🧹 Performing recording cleanup...");

  if (state.room) {
    try {
      await state.room.disconnect();
    } catch (error) {
      console.warn("Error disconnecting room during cleanup:", error);
    }
    state.room = null;
  }

  if (state.audioTrack) {
    try {
      state.audioTrack.stop();
    } catch (error) {
      console.warn("Error stopping audio track during cleanup:", error);
    }
    state.audioTrack = null;
  }

  if (state.videoTrack) {
    try {
      state.videoTrack.stop();
    } catch (error) {
      console.warn("Error stopping video track during cleanup:", error);
    }
    state.videoTrack = null;
  }

  if (state.screenVideoTrack) {
    try {
      state.screenVideoTrack.stop();
    } catch (error) {
      console.warn("Error stopping screen video track during cleanup:", error);
    }
    state.screenVideoTrack = null;
  }

  if (state.screenAudioTrack) {
    try {
      state.screenAudioTrack.stop();
    } catch (error) {
      console.warn("Error stopping screen audio track during cleanup:", error);
    }
    state.screenAudioTrack = null;
  }

  // Reset input connection status since tracks are stopped
  state.screenShare.inputsConnected = false;

  // Stop screen preview timer
  stopScreenPreviewTimer();

  // Stop audio level monitoring
  stopAudioLevelMonitoring();

  // Stop timer
  stopTimer();

  // Clear text response history
  textResponseHistory.length = 0;

  state.isRecording = false;
  updateUI();
  updateDebugStatus("✅ Recording cleanup completed");
}

async function stopRecording() {
  updateDebugStatus("🛑 Stopping recording...");
  
  // Compute approximate tokens used and update display (BEFORE stopping timer)
  updateApproximateTokens();
  
  // Stop the timer
  stopTimer();
  
  // Add system message for recording stop (before cleanup in case it affects the display)
  if (state.isRecording) {
    addSystemMessage("Recording finished");
  }
  
  await performRecordingCleanup();
  
  // Schedule token fetch 10 seconds after ending conversation
  scheduleTokenFetch(10000);
  
  // Update output panel close button state (panel remains open)
  updateOutputPanelCloseButton();
  
  // Update UI to show stopped state
  recordingStatus.textContent = "Ready to record";
  livekitStatus.textContent = "LiveKit: Disconnected";
  updateDebugStatus("✅ Recording stopped");
}

// UI Updates
function updateUI() {
  updateDebugStatus(`🔄 UpdateUI called, isLoggedIn: ${state.isLoggedIn}`);

  // Update theme
  updateTheme();

  // Update login status and panel states
  if (state.isLoggedIn) {
    // Switch panel to logged-in state
    if (loginControls) {
      loginControls.classList.add("hidden");
    }
    if (recordingControls) {
      recordingControls.classList.remove("hidden");
    }
    
    // Update panel button states
    updatePanelButtonStates();
    
    // Update token display
    updateTokenDisplay();
  } else {
    // Switch panel to logged-out state
    if (loginControls) {
      loginControls.classList.remove("hidden");
    }
    if (recordingControls) {
      recordingControls.classList.add("hidden");
    }
    
    // Hide token display when not logged in
    if (tokenDisplay) {
      tokenDisplay.textContent = "";
    }
  }

  // Update permission status
  micStatus.textContent = state.permissions.microphone ? "✅" : "❌";
  screenStatus.textContent = state.permissions.screen ? "✅" : "❌";
  audioStatus.textContent = state.permissions.audio ? "✅" : "❌";
  
  // Update agent type dropdown
  if (agentTypeDropdown) {
    agentTypeDropdown.value = state.agentType;
  }
  
  // Sync panel dropdown with value
  if (panelAgentDropdown && agentTypeDropdown) {
    panelAgentDropdown.value = agentTypeDropdown.value;
  }
  
  // Update importance slider
  if (importanceSlider) {
    importanceSlider.value = state.importanceLevel.toString();
  }
  
  // Update output panel importance slider
  if (outputImportanceSlider) {
    outputImportanceSlider.value = state.importanceLevel.toString();
  }
  
  // Show/hide importance slider section
  if (importanceSliderSection) {
    importanceSliderSection.style.display = state.taggedHintsEnabled ? 'block' : 'none';
  }
  
  // Show/hide text response section based on assistant mode
  if (textResponseSection) {
    if (state.assistantMode === 'text') {
      textResponseSection.classList.remove('hidden');
    } else {
      textResponseSection.classList.add('hidden');
    }
  }
  
  // Update output panel content if it's visible
  if (outputPanel && !outputPanel.classList.contains('hidden')) {
    updateOutputPanelContent();
  }
  
  // Update debug button visibility
  updateDebugButtonVisibility();
  
  // Update screen sharing UI
  if (microphoneToggle) {
    microphoneToggle.checked = state.screenShare.microphoneEnabled;
  }
  if (computerVideoToggle) {
    computerVideoToggle.checked = state.screenShare.computerVideoEnabled;
  }
  if (computerAudioToggle) {
    computerAudioToggle.checked = state.screenShare.computerAudioEnabled;
    // Disable computer audio toggle when in Voice mode
    const isVoiceMode = state.assistantMode === 'voice';
    computerAudioToggle.disabled = isVoiceMode;
    
    // Add tooltip when disabled in voice mode
    if (isVoiceMode) {
      computerAudioToggle.title = "Computer audio is not usable in voice mode, otherwise audio would loop";
      computerAudioToggle.parentElement?.classList.add('disabled-voice-mode');
    } else {
      computerAudioToggle.title = "";
      computerAudioToggle.parentElement?.classList.remove('disabled-voice-mode');
    }
  }
  
  // Update inputs buttons and status
  if (connectInputsBtn && disconnectInputsBtn) {
    if (state.screenShare.inputsConnected) {
      connectInputsBtn.style.display = "none";
      disconnectInputsBtn.style.display = "inline-block";
    } else {
      connectInputsBtn.style.display = "inline-block";
      disconnectInputsBtn.style.display = "none";
    }
  }
  
  if (inputsStatus) {
    if (state.screenShare.inputsConnected) {
      inputsStatus.textContent = "✅ Inputs connected";
      inputsStatus.className = "inputs-status connected";
    } else {
      inputsStatus.textContent = "Inputs not connected";
      inputsStatus.className = "inputs-status";
    }
  }
  
  // Update audio level bars visual state
  if (microphoneLevelBar) {
    if (state.screenShare.inputsConnected && state.screenShare.microphoneEnabled) {
      microphoneLevelBar.parentElement?.classList.remove('disconnected');
    } else {
      microphoneLevelBar.parentElement?.classList.add('disconnected');
    }
  }
  
  if (computerAudioLevelBar) {
    if (state.screenShare.inputsConnected && state.screenShare.computerAudioEnabled) {
      computerAudioLevelBar.parentElement?.classList.remove('disconnected');
    } else {
      computerAudioLevelBar.parentElement?.classList.add('disconnected');
    }
  }
  
  // Sync settings panel if it's open
  if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
    syncSettingsValues();
  }
  
  // Update settings panel audio bar states
  updateSettingsAudioBarStates();
}

// Theme management
function updateTheme() {
  const root = document.documentElement;

  if (currentTheme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    if (themeToggleBtn) {
      themeToggleBtn.textContent = '🌙 Dark';
    }
  } else {
    root.setAttribute('data-theme', 'light');
    if (themeToggleBtn) {
      themeToggleBtn.textContent = '☀️ Light';
    }
  }
}

function initializeTheme() {
  // Check for saved theme preference
  const savedTheme = localStorage.getItem('aya-theme') as 'light' | 'dark' | null;

  if (savedTheme) {
    currentTheme = savedTheme;
  } else {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    currentTheme = prefersDark ? 'dark' : 'light';
  }

  updateTheme();
}

// Theme toggle functionality
function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  localStorage.setItem('aya-theme', currentTheme);
  updateTheme();
}

// Track if we've already initialized to prevent duplicate event listeners
let isInitialized = false;

// Debug message history
interface DebugMessage {
  timestamp: Date;
  message: string;
}

const debugMessageHistory: DebugMessage[] = [];
const MAX_DEBUG_MESSAGES = 1000; // Keep last 1000 messages

// Mouse event control functions
async function enableMouseEvents() {
  if (window.electronAPI) {
    try {
      await window.electronAPI.setMouseEvents(false);
      // updateDebugStatus("🖱️ Mouse events enabled");
    } catch (error) {
      console.error("Failed to enable mouse events:", error);
    }
  }
}

async function disableMouseEvents() {
  if (window.electronAPI) {
    try {
      await window.electronAPI.setMouseEvents(true);
      // updateDebugStatus("🖱️ Mouse events disabled (click-through)");
    } catch (error) {
      console.error("Failed to disable mouse events:", error);
    }
  }
}

// Panel dragging functionality
let isDragging = false;
let dragStartX = 0;
let panelStartX = 0;

function setupPanelDragging() {
  const panelsContainer = document.getElementById('panels-container');
  const mainPanel = document.querySelector('.main-panel') as HTMLElement;
  
  if (!panelsContainer || !mainPanel) {
    updateDebugStatus("❌ Could not find panels for dragging setup");
    return;
  }

  // Get initial position (50% from left)
  let panelPositionPercent = 50;

  function updatePanelPosition() {
    if (panelsContainer) {
      // Use transform to position the panel, which overrides the CSS transform
      panelsContainer.style.left = `${panelPositionPercent}%`;
      panelsContainer.style.transform = `translateX(-50%)`;
      // Force a repaint to ensure the change takes effect
      panelsContainer.offsetHeight;
      // updateDebugStatus(`📍 Panel position: ${panelPositionPercent.toFixed(1)}%`);
    }
  }

  function handleMouseDown(e: MouseEvent) {
    // Only start dragging if clicking on the main panel itself, not buttons
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'INPUT') {
      return;
    }

    if (!panelsContainer) return;

    isDragging = true;
    dragStartX = e.clientX;
    
    // Calculate current panel position in pixels
    const rect = panelsContainer.getBoundingClientRect();
    const panelCenterX = rect.left + rect.width / 2;
    panelStartX = panelCenterX;
    
    mainPanel.classList.add('dragging');
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Prevent default to avoid text selection
    e.preventDefault();
    updateDebugStatus("🖱️ Started dragging panel");
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging || !panelsContainer) return;

    const deltaX = e.clientX - dragStartX;
    const newCenterX = panelStartX + deltaX;
    
    // Get the actual panel width for better boundary calculations
    const panelRect = panelsContainer.getBoundingClientRect();
    const panelWidth = panelRect.width;
    const viewportWidth = window.innerWidth;
    
    // Calculate the percentage that keeps the panel fully within the viewport
    // The center position should be between (panelWidth/2) and (viewportWidth - panelWidth/2)
    const minCenterX = panelWidth / 2;
    const maxCenterX = viewportWidth - panelWidth / 2;
    
    // Constrain the center position
    const constrainedCenterX = Math.max(minCenterX, Math.min(maxCenterX, newCenterX));
    
    // Convert to percentage
    panelPositionPercent = (constrainedCenterX / viewportWidth) * 100;
    
    updatePanelPosition();
  }

  function handleMouseUp() {
    if (!isDragging) return;

    isDragging = false;
    mainPanel.classList.remove('dragging');
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    updateDebugStatus("🖱️ Stopped dragging panel");
  }

  // Add event listeners
  mainPanel.addEventListener('mousedown', handleMouseDown);
  
  // Set initial position
  updatePanelPosition();
  
  updateDebugStatus("✅ Panel dragging setup complete");
}

function handleMouseEnter(event: Event) {
  enableMouseEvents();
}

function handleMouseLeave(event: Event) {
  disableMouseEvents();
}

function setupMouseEventHandlers() {
  // Only track the main containers - much simpler approach
  const containersToTrack = [
    '.main-panel',
    '.transcript-panel',
    '.settings-panel',
    '.output-panel',
    '.debug-panel-container',
    '.auth-section',
    '.recording-section', 
    '.permissions-section',
    '.text-output-section',
    '.text-response-section'
  ];

  let handlersAttached = 0;

  containersToTrack.forEach(selector => {
    const container = document.querySelector(selector);
    if (container) {
      container.addEventListener('mouseenter', handleMouseEnter);
      container.addEventListener('mouseleave', handleMouseLeave);
      handlersAttached++;
      updateDebugStatus(`🖱️ Mouse handlers attached to ${selector}`);
    }
  });

  updateDebugStatus(`🖱️ Mouse event handlers set up for ${handlersAttached} containers`);
}

async function initializeApp() {
  if (isInitialized) {
    updateDebugStatus("⚠️ App already initialized, skipping...");
    return;
  }

  // Build-time config is immediately available
  updateDebugStatus(`✅ Build-time config loaded: AUTH_HOST=${authHost}, DEBUG_MODE=${debugMode}, NODE_ENV=${nodeEnv}`);

  updateDebugStatus("🔥 Initializing Electron app");
  initializeTheme();
  setupEventListeners(); // Then setup event listeners for panel elements
  setupMouseEventHandlers(); // Setup mouse event control
  setupPanelDragging(); // Setup panel dragging functionality
  setupDeepLinkHandling();
  
  // Apply initial agent type configuration and update UI after panels are loaded
  handleAgentTypeChange(state.agentType);
  updateUI();
  
  isInitialized = true;
}

// Wait for DOM to be fully loaded before setting up event listeners
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeApp().catch(error => {
      updateDebugStatus(`❌ App initialization failed: ${error}`);
    });
  });
} else {
  // DOM is already loaded
  initializeApp().catch(error => {
    updateDebugStatus(`❌ App initialization failed: ${error}`);
  });
}

// Initialize the app
updateDebugStatus("🚀 Electron app initializing...");

// Check permissions on startup
if (window.electronAPI) {
  checkPermissionStatus();
  loadScreenSources(); // Load available screen sources
  updateDebugStatus("🔍 Initial permission check and screen source loading requested");
} else {
  updateDebugStatus("⚠️ Running outside Electron - limited functionality");
}

// Add global debug functions
(window as any).testLogin = testLogin;
(window as any).refreshPermissions = refreshPermissions;