function sendTabCommand(action, data = null) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: action, data: data });
        }
    });
}

// Global state variable for the toggle
let isNarrating = false;

document.getElementById('btnToggleNarration').addEventListener('click', (e) => {
    isNarrating = !isNarrating;
    const btn = e.target;

    if (isNarrating) {
        btn.textContent = "Stop Narration";
        btn.style.backgroundColor = "#fee2e2";
        btn.style.color = "#991b1b";
        sendTabCommand('toggle-narration', true);
    } else {
        btn.textContent = "Start Narration";
        btn.style.backgroundColor = ""; // Reset to default
        btn.style.color = "";
        sendTabCommand('toggle-narration', false);
        sendTabCommand('stop'); // Stop current speech
    }
});

document.getElementById('btnReadSel').addEventListener('click', () => sendTabCommand('summarize-selection'));
document.getElementById('btnReadPara').addEventListener('click', () => sendTabCommand('read-paragraph'));
document.getElementById('btnRepeat').addEventListener('click', () => sendTabCommand('repeat-last'));
document.getElementById('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

const fileInput = document.getElementById('fileInput');
const btnSummarizeFile = document.getElementById('btnSummarizeFile');
const fileStatus = document.getElementById('fileStatus');
let extractedText = "";

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    window.speechSynthesis.speak(new SpeechSynthesisUtterance("File selected: " + file.name));
    fileStatus.textContent = "Loading file...";

    try {
        if (file.type.includes("text/plain")) {
            extractedText = await file.text();
            fileStatus.textContent = "Text extracted automatically.";
            btnSummarizeFile.disabled = false;
        } else {
            fileStatus.textContent = "Only plain text is supported in this demo without libs.";
            btnSummarizeFile.disabled = true;
        }
    } catch (err) {
        fileStatus.textContent = "Error reading file.";
    }
});

btnSummarizeFile.addEventListener('click', () => {
    if (!extractedText) return;
    fileStatus.textContent = "Summarizing...";
    chrome.runtime.sendMessage({ action: "summarize", text: extractedText }, (summary) => {
        fileStatus.textContent = "Summary ready.";
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(summary));
    });
});
