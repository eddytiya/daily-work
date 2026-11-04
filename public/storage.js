/* Local SQLite on loopback; authenticated Supabase storage on hosted sites.
   Use ?cloud=1 on localhost to test the hosted experience. */
(() => {
  const config = window.DAILY_WORK_CONFIG;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && new URLSearchParams(location.search).get('cloud') !== '1';
  const sessionKey = 'daily-work-session';
  let session = null, refreshJob = null, sessionRevision = 0;
  try { session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch {}
  function saveSession(value) {
    sessionRevision++;
    session = value?.access_token ? {...value, expires_at: Date.now() + Number(value.expires_in || 3600) * 1000} : null;
    try { if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session)); else sessionStorage.removeItem(sessionKey); } catch {}
  }
  async function request(path, options = {}, token) {
    const headers = {'apikey': config.publishableKey, 'Content-Type': 'application/json', ...options.headers};
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetch(config.supabaseUrl + path, {...options, headers}); }
    catch { throw Error('Could not connect to Supabase. Check your internet connection and try again.'); }
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { throw Error('Unexpected response from the database. Try again.'); }
    if (!response.ok) {
      const error = Error(data?.msg || data?.error_description || data?.message || data?.error || 'The request failed.');
      error.status = response.status; error.code = data?.code; throw error;
    }
    return data;
  }
  async function accessToken() {
    if (!session) throw Error('Sign in to access your work entries.');
    if (session.expires_at > Date.now() + 60000) return session.access_token;
    const revision = sessionRevision;
    if (!refreshJob) refreshJob = request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({refresh_token: session.refresh_token})
    }).then(value => {if (sessionRevision !== revision) throw Error('Your session changed. Sign in again.'); saveSession(value); return session.access_token;}).catch(error => {
      if (sessionRevision === revision && [400,401,403].includes(error.status)) {
        saveSession(null); window.dispatchEvent(new Event('work-signed-out'));
      }
      throw error;
    }).finally(() => {refreshJob = null;});
    return refreshJob;
  }
  const storage = {
    local,
    signedIn: () => local || !!session,
    email: () => session?.user?.email || '',
    async signIn(email, password) {
      saveSession(await request('/auth/v1/token?grant_type=password', {method: 'POST', body: JSON.stringify({email, password})}));
    },
    async signUp(email, password) {
      const data = await request('/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + '/'), {
        method: 'POST', body: JSON.stringify({email, password})
      });
      if (data?.access_token) saveSession(data);
      return !!data?.access_token;
    },
    async signOut() {
      const token = session?.access_token;
      saveSession(null); window.dispatchEvent(new Event('work-signed-out'));
      if (token) {
        try { await request('/auth/v1/logout?scope=local', {method: 'POST'}, token); }
        catch { /* Local credentials have already been cleared. */ }
      }
    },
    async api(path, options = {}) {
      if (local) {
        const response = await fetch(path, options), data = await response.json();
        if (!response.ok) throw Error(data.error || 'Could not complete the request');
        return data;
      }
      const token = await accessToken(), method = options.method || 'GET';
      try {
        if (method === 'GET') {
          const all = []; let offset = 0;
          while (true) {
            const rows = await request(`/rest/v1/entries?select=id,date,title,notes,category,hours,updated,attachments&order=date.desc,id.desc&limit=500&offset=${offset}`, {}, token);
            all.push(...rows); if (rows.length < 500) break; offset += rows.length;
          }
          return all;
        }
        let endpoint = '/rest/v1/entries', body;
        if (method === 'DELETE') endpoint += '?id=eq.' + encodeURIComponent(path.split('/').pop());
        else {
          const input = JSON.parse(options.body);
          body = {date: input.date, title: input.title.trim(), notes: input.notes.trim(), category: input.category, hours: input.hours, attachments: input.attachments || []};
          if (input.id) endpoint += '?id=eq.' + encodeURIComponent(input.id);
          options = {...options, method: input.id ? 'PATCH' : 'POST'};
        }
        const rows = await request(endpoint, {
          method: options.method, headers: {'Prefer': 'return=representation'},
          ...(body ? {body: JSON.stringify(body)} : {})
        }, token);
        if (!rows?.length) throw Error('This entry no longer exists. Refresh and try again.');
        return {ok: true};
      } catch (error) {
        if (error.status === 401) {saveSession(null); window.dispatchEvent(new Event('work-signed-out'));}
        if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST204' || error.code === '42703') throw Error('The database needs setup. Run supabase/schema.sql in your Supabase SQL Editor, then reload.');
        throw error;
      }
    }
  };
  window.WorkStorage = storage;
})();
