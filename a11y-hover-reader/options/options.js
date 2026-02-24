document.addEventListener('DOMContentLoaded', () => {
    const populateVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        const select = document.getElementById('voiceSelect');
        select.innerHTML = '<option value="">Default OS Voice</option>';
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            select.appendChild(option);
        });
    };

    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = populateVoices;
    } else {
        populateVoices();
    }

    chrome.storage.sync.get({
        throttleInterval: 500,
        verbosity: 'normal',
        directionNarration: true,
        speechRate: 1.0,
        voice: '',
        useRemoteSummarizer: false,
        openAiApiKey: '',
        elevenLabsKey: ''
    }, (items) => {
        document.getElementById('throttle').value = items.throttleInterval;
        document.getElementById('verbosity').value = items.verbosity;
        document.getElementById('directionNarration').checked = items.directionNarration;
        document.getElementById('speechRate').value = items.speechRate;
        document.getElementById('rateValue').textContent = items.speechRate;
        setTimeout(() => { document.getElementById('voiceSelect').value = items.voice; }, 500);
        document.getElementById('useRemoteSummarizer').checked = items.useRemoteSummarizer;
        document.getElementById('openAiApiKey').value = items.openAiApiKey;
        document.getElementById('elevenLabsKey').value = items.elevenLabsKey;
    });

    document.getElementById('speechRate').addEventListener('input', (e) => {
        document.getElementById('rateValue').textContent = e.target.value;
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        const config = {
            throttleInterval: parseInt(document.getElementById('throttle').value),
            verbosity: document.getElementById('verbosity').value,
            directionNarration: document.getElementById('directionNarration').checked,
            speechRate: parseFloat(document.getElementById('speechRate').value),
            voice: document.getElementById('voiceSelect').value,
            useRemoteSummarizer: document.getElementById('useRemoteSummarizer').checked,
            openAiApiKey: document.getElementById('openAiApiKey').value,
            elevenLabsKey: document.getElementById('elevenLabsKey').value
        };

        chrome.storage.sync.set(config, () => {
            const status = document.getElementById('status');
            status.textContent = 'Options saved safely.';
            setTimeout(() => { status.textContent = ''; }, 2000);
        });
    });
});
