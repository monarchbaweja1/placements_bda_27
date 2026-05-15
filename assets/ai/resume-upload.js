(function initPlacementResumeUploadUtils() {
  const MAX_FILE_BYTES = 6 * 1024 * 1024;
  const SKILL_TERMS = [
    'SQL', 'Python', 'R', 'Excel', 'Power BI', 'Tableau', 'Machine Learning', 'Statistics',
    'Pandas', 'NumPy', 'Scikit-learn', 'TensorFlow', 'PyTorch', 'Spark', 'AWS', 'Azure',
    'BigQuery', 'MySQL', 'PostgreSQL', 'Financial Analysis', 'Credit Risk', 'Valuation',
    'Banking', 'Insurance', 'Risk Management', 'Healthcare', 'Pharma', 'Market Access',
    'Hospital Operations', 'Sales', 'Marketing', 'Strategy', 'Operations', 'Consulting',
    'Supply Chain', 'Business Development', 'CRM', 'SAP', 'PowerPoint', 'MS Office',
    'Data Analysis', 'Data Analytics', 'Business Analytics', 'Predictive Modeling',
    'Regression', 'Classification', 'Clustering', 'NLP', 'Deep Learning', 'GenAI',
    'Looker Studio', 'Google Analytics', 'SPSS', 'SAS', 'VBA', 'Advanced Excel'
  ];
  const SKILL_ALIASES = {
    'Machine Learning': ['machine learning', 'ml'],
    'Power BI': ['power bi', 'powerbi'],
    'Scikit-learn': ['scikit-learn', 'sklearn'],
    'Looker Studio': ['looker studio', 'google data studio'],
    'Google Analytics': ['google analytics', 'ga4'],
    'Advanced Excel': ['advanced excel', 'pivot table', 'vlookup', 'xlookup']
  };

  window.PlacementResumeUpload = {
    extractResumeFile,
    deriveCgpa,
    deriveSkills,
    deriveProfileSummary
  };

  async function extractResumeFile(file, token) {
    if (!file) throw new Error('Choose a resume file first.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Upload a resume file under 6 MB.');

    const dataBase64 = await readAsDataUrl(file);
    const request = {
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
      };
    let res;
    try {
      res = await fetchWithLocalFallback('/api/ai/extract-resume', request);
    } catch {
      throw new Error('Could not reach the resume extraction API. Start the app with npm run dev and open http://localhost:3000, then upload again.');
    }

    const payload = await readJson(res);
    if (!res.ok || !payload.ok) {
      throw new Error(payload?.error?.message || 'Unable to extract text from this resume.');
    }
    return payload;
  }

  function deriveCgpa(text) {
    const normalized = normalizeText(text);

    // 1. Explicit /8 patterns (college grading scale)
    const patterns8 = [
      /\b(?:cgpa|cpi|gpa|grade\s+point\s+average)\b[^0-9]{0,40}([0-9](?:\.\d{1,2})?|8(?:\.0{1,2})?)\s*\/\s*8\b/i,
      /\b([0-9](?:\.\d{1,2})?|8(?:\.0{1,2})?)\s*\/\s*8\b[^A-Za-z0-9]{0,30}\b(?:cgpa|cpi|gpa)\b/i,
    ];
    for (const pattern of patterns8) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const value = parseFloat(match[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 8) return formatCgpa(value);
    }

    // 2. Keyword + decimal number with no explicit scale (e.g. "CGPA: 7.2")
    const patternNoScale = /\b(?:cgpa|cpi|gpa|grade\s+point\s+average)\b[^0-9]{0,20}([1-9]\.\d{1,2})\b/i;
    const matchNoScale = normalized.match(patternNoScale);
    if (matchNoScale) {
      const value = parseFloat(matchNoScale[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 8) return formatCgpa(value);
    }

    // 3. Education section — look for explicit /8
    const education = extractSection(normalized, ['education', 'academic background', 'academics'], [
      'experience', 'internship', 'projects', 'skills', 'certifications', 'positions', 'achievements'
    ]);
    if (education) {
      const match = education.match(/\b([0-9](?:\.\d{1,2})?)\s*\/\s*8\b/i);
      if (match) {
        const value = parseFloat(match[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 8) return formatCgpa(value);
      }
    }

    return '';
  }

  function deriveSkills(text) {
    const normalized = normalizeText(text);
    const skillSection = extractSection(normalized, ['skills', 'technical skills', 'tools', 'competencies'], [
      'experience', 'internship', 'projects', 'education', 'certifications', 'achievements'
    ]);
    const searchable = `${skillSection || ''} ${normalized}`;
    const found = SKILL_TERMS.filter(term => hasSkill(searchable, term));
    return [...new Set(found)].slice(0, 20).join(', ');
  }

  function deriveProfileSummary(text) {
    const normalized = normalizeText(text);
    const focusedSections = [
      extractSection(normalized, ['experience', 'work experience', 'internship', 'internships'], ['projects', 'education', 'skills', 'certifications', 'achievements']),
      extractSection(normalized, ['projects', 'academic projects', 'key projects'], ['experience', 'education', 'skills', 'certifications', 'achievements']),
      extractSection(normalized, ['achievements', 'positions of responsibility'], ['experience', 'projects', 'education', 'skills', 'certifications'])
    ].filter(Boolean).join(' ');

    const source = focusedSections || normalized;
    const sentences = source
      .split(/(?:[.!?]\s+|\n+|\u2022|-{2,})/)
      .map(sentence => sentence.replace(/\s+/g, ' ').trim())
      .filter(sentence => sentence.length >= 28 && sentence.length <= 320);

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
    if (SKILL_TERMS.some(term => hasSkill(sentence, term))) score += 2;
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

  async function readJson(res) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(res.ok
        ? 'Resume extraction returned an invalid response.'
        : `Resume extraction failed (${res.status}). Please try a smaller PDF/DOCX or paste the text manually.`);
    }
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractSection(text, startLabels, endLabels) {
    const lines = normalizeText(text).split(/\n+/);
    let capture = false;
    const out = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const key = line.toLowerCase().replace(/[^a-z ]/g, '').trim();
      const isStart = startLabels.some(label => key === label || key.startsWith(`${label} `));
      const isEnd = endLabels.some(label => key === label || key.startsWith(`${label} `));

      if (capture && isEnd) break;
      if (isStart) {
        capture = true;
        continue;
      }
      if (capture && line) out.push(line);
    }

    return out.join(' ').trim();
  }

  function formatCgpa(value) {
    return String(Math.round(value * 100) / 100);
  }

  function hasSkill(text, term) {
    const aliases = SKILL_ALIASES[term] || [term];
    return aliases.some(alias => {
      const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, 'i');
      return pattern.test(text);
    });
  }

  function apiUrl(path) {
    if (window.PLACEMENT_API_BASE) return `${String(window.PLACEMENT_API_BASE).replace(/\/$/, '')}${path}`;
    if (window.location.protocol === 'file:') return `http://localhost:3000${path}`;
    return path;
  }

  async function fetchWithLocalFallback(path, options) {
    if (window.location.protocol !== 'file:') return fetch(apiUrl(path), options);

    const urls = [
      apiUrl(path),
      `http://localhost:3001${path}`
    ];
    let lastError;
    for (const url of urls) {
      try {
        return await fetch(url, options);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Local API unavailable.');
  }
})();
