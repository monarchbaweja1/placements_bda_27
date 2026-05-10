const PROGRAMME_ALIASES = {
  bda: 'bda',
  'pgdm-bda': 'bda',
  bigdata: 'bda',
  analytics: 'bda',
  bifs: 'bifs',
  bfsi: 'bifs',
  'pgdm-bifs': 'bifs',
  hcm: 'hcm',
  'pgdm-hcm': 'hcm',
  healthcare: 'hcm',
  core: 'core',
  pgdm: 'core',
  'pgdm-core': 'core'
};

export function normalizeProgrammeCode(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase().replace(/_/g, '-');
  return PROGRAMME_ALIASES[key] || key;
}

export async function loadUserProgramme(supabase, userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('programme_id, role, programmes:programme_id(id, code, name)')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    profile: data || null,
    programme: data?.programmes || null,
    role: data?.role || 'student'
  };
}

export async function assertProgrammeAccess({ supabase, userId, requestedProgramme, requireAssignedProgramme = false }) {
  const normalizedRequested = normalizeProgrammeCode(requestedProgramme);
  const userContext = await loadUserProgramme(supabase, userId);
  const assignedCode = normalizeProgrammeCode(userContext.programme?.code);

  if (requireAssignedProgramme && !assignedCode && userContext.role !== 'admin') {
    return {
      ok: false,
      status: 409,
      error: {
        code: 'programme_profile_required',
        message: 'Your account needs an assigned programme before using AI features.'
      },
      userContext
    };
  }

  if (assignedCode && normalizedRequested && assignedCode !== normalizedRequested && userContext.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error: {
        code: 'programme_mismatch',
        message: 'Requested programme does not match the authenticated user profile.'
      },
      userContext
    };
  }

  return {
    ok: true,
    programmeCode: assignedCode || normalizedRequested || null,
    userContext
  };
}
