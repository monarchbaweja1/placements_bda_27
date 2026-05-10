(function initGimResumeUploadUtils() {
  const MAX_FILE_BYTES = 6 * 1024 * 1024;
  const SKILL_TERMS = [
    'SQL', 'Python', 'R', 'Excel', 'Power BI', 'Tableau', 'Machine Learning', 'Statistics',
    'Pandas', 'NumPy', 'Scikit-learn', 'TensorFlow', 'PyTorch', 'Spark', 'AWS', 'Azure',
    'BigQuery', 'MySQL', 'PostgreSQL', 'Financial Analysis', 'Credit Risk', 'Valuation',
    'Banking', 'Insurance', 'Risk Management', 'Healthcare', 'Pharma', 'Market Access',
    'Hospital Operations', 'Sales', 'Marketing', 'Strategy', 'Operations', 'Consulting',
    'Supply Chain', 'Business Development', 'CRM', 'SAP'
  ];

  window.GimResumeUpload = {
    extractResumeFile,
    deriveSkills,
    deriveProfileSummary
  };

  async function extractResumeFile(file, token) {
    if (!file) throw new Error('Choose a resume file first.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Upload a resume file under 6 MB.');

    const dataBase64 = await readAsDataUrl(file);
    const res = await fetch('/api/ai/extract-resume', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        dataBase64
      })
    });

    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload?.error?.message || 'Unable to extract text from this resume.');
    }
    return payload;
  }

  function deriveSkills(text) {
    const lower = String(text || '').toLowerCase();
    const found = SKILL_TERMS.filter(term => lower.includes(term.toLowerCase()));
    return [...new Set(found)].slice(0, 20).join(', ');
  }

  function deriveProfileSummary(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length >= 35);

    const scored = sentences.map(sentence => ({
      sentence,
      score: scoreSentence(sentence)
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.sentence)
      .join('\n');
  }

  function scoreSentence(sentence) {
    const lower = sentence.toLowerCase();
    let score = 0;
    if (/\b(project|intern|experience|built|developed|created|led|managed|analy[sz]ed|dashboard|model|forecast|strategy)\b/.test(lower)) score += 4;
    if (/\b\d+(\.\d+)?\s?(%|lpa|cr|crore|lakhs?|k|m|mn|million|hours?|days?)\b/i.test(sentence)) score += 3;
    if (SKILL_TERMS.some(term => lower.includes(term.toLowerCase()))) score += 2;
    if (sentence.length > 220) score -= 1;
    return score;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
  }
})();
