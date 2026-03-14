import { useState } from 'react';
import { Shield, Key, Server, Github, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface SetupProps {
  onComplete: () => void;
}

export default function Setup({ onComplete }: SetupProps) {
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [serverAddress, setServerAddress] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!anthropicApiKey.trim()) {
      setError('Anthropic API Key is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: anthropicApiKey.trim(),
          serverAddress: serverAddress.trim(),
          githubRepo: githubRepo.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Setup failed');
        return;
      }

      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to connect to API');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-500/10 rounded-xl mb-4">
            <Shield className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">AI Remote Service</h1>
          <p className="text-gray-500 text-sm mt-1">First-time setup — configure your deployment</p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="bg-[#111118] border border-gray-800 rounded-xl p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Required Section */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-4 pb-2 border-b border-gray-800">
              Required
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    Anthropic API Key
                    <span className="text-red-400">*</span>
                  </span>
                </label>
                <input
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2.5 bg-[#0a0a0f] border border-gray-700 rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
                <p className="text-[11px] text-gray-600 mt-1">
                  Get one at console.anthropic.com — powers AI analysis and auto-remediation
                </p>
              </div>
            </div>
          </div>

          {/* Networking Section */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-4 pb-2 border-b border-gray-800">
              Networking (Optional)
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-blue-400" />
                    Server Address
                  </span>
                </label>
                <input
                  type="text"
                  value={serverAddress}
                  onChange={(e) => setServerAddress(e.target.value)}
                  placeholder="e.g. 192.168.1.100 or rmm.example.com"
                  className="w-full px-3 py-2.5 bg-[#0a0a0f] border border-gray-700 rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <p className="text-[11px] text-gray-600 mt-1">
                  Public IP or domain where agents will reach this server
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Github className="w-3.5 h-3.5 text-gray-400" />
                    GitHub Repo
                  </span>
                </label>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  placeholder="e.g. your-org/ai-rmm-docker"
                  className="w-full px-3 py-2.5 bg-[#0a0a0f] border border-gray-700 rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <p className="text-[11px] text-gray-600 mt-1">
                  For agent binary downloads (org/repo format). Leave blank to distribute manually.
                </p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Complete Setup
              </>
            )}
          </button>

          <p className="text-[11px] text-gray-600 text-center">
            Settings are stored in the database and can be updated later from the Settings page.
          </p>
        </form>
      </div>
    </div>
  );
}
