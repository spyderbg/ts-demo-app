import {useEffect, useMemo, useRef, useState} from 'react';
import {
    ArrowDown,
    ArrowRight,
    ArrowUpRight,
    AudioLines,
    Box,
    Check,
    CheckCheck,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    Clock3,
    Copy,
    ExternalLink,
    File,
    Folder,
    FolderOpen,
    Grid2X2,
    HardDrive,
    Image,
    Layers,
    LayoutGrid,
    List,
    LoaderCircle,
    MoreHorizontal,
    Power,
    RefreshCw,
    Search,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    X
} from 'lucide-react';
import type {Asset, AssetStatus, AssetType, LibraryResponse, WorkspaceConfig} from '../../backend/types';
import packageInfo from '../../package.json';
import {useBackendLifetime} from './useBackendLifetime';

type View = 'library' | 'pending' | 'synced' | 'activity' | 'settings';
const typeIcons = {texture: Image, model: Box, material: Layers, audio: AudioLines, other: File};
const typeNames = {texture: 'Textures', model: 'Models', material: 'Materials', audio: 'Audio', other: 'Other files'};
const statusNames = {new: 'New asset', modified: 'Modified', synced: 'In sync'};

function size(bytes: number) {
    return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function time(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

const previewURL = (asset: Asset, revision: string) => `/api/assets/${asset.id}/preview?v=${encodeURIComponent(asset.modifiedAt)}&scan=${encodeURIComponent(revision)}`;

function Status({status}: { status: AssetStatus }) {
    return <span className={`status status-${status}`}>{status === 'synced' ? <Check size={11}/> :
        <span className="status-dot"/>}{statusNames[status]}</span>;
}

function Thumbnail({asset, large = false, revision}: { asset: Asset; large?: boolean; revision: string }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [asset.id, asset.modifiedAt, revision]);
    const Icon = typeIcons[asset.type];
    return <div
        className={`thumbnail ${large ? 'large' : ''} ${asset.type} ${asset.extension === 'dds' ? 'dds' : ''} ${asset.name.includes('normal') ? 'normal-map' : ''}`}>
        {asset.preview && !failed ? <img src={previewURL(asset, revision)} alt={`${asset.name} preview`} loading="lazy"
                                         onError={() => setFailed(true)}/> :
            <div className={`generic-preview ${asset.type}`}><Icon size={large ? 68 : 45}
                                                                   strokeWidth={1}/>{asset.type === 'audio' &&
                <div className="waveform">{Array.from({length: 30}, (_, i) => <i key={i}
                                                                                 style={{height: `${8 + Math.abs(Math.sin(i * 1.7)) * 37}px`}}/>)}</div>}
            </div>}
        {!large && <span className="file-format">{asset.extension.toUpperCase()}</span>}
        {large && asset.type === 'model' && <span className="illustration-label">Demo illustration</span>}
        {large && (!asset.preview || failed) &&
            <span className="illustration-label">{asset.previewError || 'No image preview available'}</span>}
    </div>;
}

function Modal({title, children, onClose, wide = false}: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    wide?: boolean
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement;
        const first = ref.current?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]');
        first?.focus();
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Tab') {
                const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]');
                if (!elements?.length) return;
                const first = elements[0], last = elements[elements.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', handler);
        return () => {
            document.removeEventListener('keydown', handler);
            previous?.focus();
        };
    }, [onClose]);
    return <div className="modal-backdrop" onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
    }}>
        <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true"
             aria-label={title}>
            <div className="modal-header"><h2>{title}</h2>
                <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19}/></button>
            </div>
            {children}</div>
    </div>;
}

export default function App() {
    const [data, setData] = useState<LibraryResponse | null>(null);
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [view, setView] = useState<View>('library');
    const [category, setCategory] = useState<AssetType | 'all'>('all');
    const [query, setQuery] = useState('');
    const [format, setFormat] = useState('all');
    const [status, setStatus] = useState<AssetStatus | 'all'>('all');
    const [sort, setSort] = useState('recent');
    const [layout, setLayout] = useState<'grid' | 'list'>('grid');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [inspecting, setInspecting] = useState<string | null>(null);
    const [busy, setBusy] = useState('');
    const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
    const [syncIds, setSyncIds] = useState<string[] | null>(null);
    const [help, setHelp] = useState(false);
    const [shutdownConfirm, setShutdownConfirm] = useState(false);
    const [stopped, setStopped] = useState(false);
    useBackendLifetime(!stopped);
    const [expanded, setExpanded] = useState(false);
    const [settings, setSettings] = useState<WorkspaceConfig | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const syncClose = useRef(() => setSyncIds(null)).current;
    const helpClose = useRef(() => setHelp(false)).current;
    const shutdownClose = useRef(() => setShutdownConfirm(false)).current;
    const previewClose = useRef(() => setExpanded(false)).current;
    useEffect(() => {
        const controller = new AbortController();
        Promise.all([fetch('/api/session', {signal: controller.signal}).then(r => r.json()), fetch('/api/library', {signal: controller.signal}).then(async r => {
            const body = await r.json();
            if (!r.ok) throw new Error(body.error);
            return body as LibraryResponse;
        })])
            .then(([session, library]) => {
                setToken(session.token);
                setData(library);
                setSettings(library.config);
                setInspecting(library.assets[0]?.id || null);
            })
            .catch(e => {
                if (e.name !== 'AbortError') setError(e.message);
            });
        return () => controller.abort();
    }, []);
    useEffect(() => {
        if (!toast) return;
        const t = window.setTimeout(() => setToast(null), toast.error ? 9000 : 4500);
        return () => clearTimeout(t);
    }, [toast]);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k' || e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
                e.preventDefault();
                if (view === 'activity' || view === 'settings') setView('library');
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [view]);
    const notify = (text: string, error = false) => setToast({text, error});

    async function api<T>(path: string, method = 'POST', body?: unknown): Promise<T> {
        const send = (sessionToken: string) => fetch(`/api/${path}`, {
            method,
            headers: {
                ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
                'x-gda-token': sessionToken
            }, ...(body !== undefined ? {body: JSON.stringify(body)} : {})
        });
        let response = await send(token);
        let value = await response.json();
        if (response.status === 403 && value.error === 'Invalid session. Reload the application.') {
            // A backend restart rotates its token. Retry only a rejected, unapplied request.
            const sessionResponse = await fetch('/api/session', {cache: 'no-store'});
            if (sessionResponse.ok) {
                const session = await sessionResponse.json();
                setToken(session.token);
                response = await send(session.token);
                value = await response.json();
            }
        }
        if (!response.ok) throw new Error(value.error || 'Request failed');
        return value;
    }

    async function rescan() {
        setBusy('scan');
        try {
            const library = await api<LibraryResponse>('scan');
            setData(library);
            setSelected(new Set());
            notify(`Library refreshed. ${library.assets.length} assets found.`);
        } catch (e) {
            notify((e as Error).message, true);
        } finally {
            setBusy('');
        }
    }

    async function openFolder(folder: 'source' | 'destination', assetId?: string) {
        try {
            await api('open-folder', 'POST', {folder, assetId});
            notify(`Opened ${folder === 'source' ? 'source' : 'GDA'} folder.`);
        } catch (e) {
            notify((e as Error).message, true);
        }
    }

    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            notify('Path copied to clipboard.');
        } catch {
            notify('Clipboard access is unavailable in this browser.', true);
        }
    }

    async function confirmSync() {
        if (!syncIds) return;
        const ids = syncIds;
        setSyncIds(null);
        setBusy('sync');
        try {
            const result = await api<{
                copied: string[];
                failures: { name: string; message: string }[];
                library: LibraryResponse
            }>('sync', 'POST', {ids});
            setData(result.library);
            setSelected(new Set());
            if (result.failures.length) notify(`${result.copied.length} synced; ${result.failures.length} failed. ${result.failures[0].name}: ${result.failures[0].message}`, true);
            else notify(result.copied.length ? `${result.copied.length} asset${result.copied.length === 1 ? '' : 's'} synced. Your GDA folder is up to date.` : 'These assets are already in sync.');
        } catch (e) {
            notify((e as Error).message, true);
        } finally {
            setBusy('');
        }
    }

    async function stopApplication() {
        setShutdownConfirm(false);
        setBusy('shutdown');
        try {
            await api('shutdown');
            setStopped(true);
        } catch (e) {
            notify((e as Error).message, true);
        } finally {
            setBusy('');
        }
    }

    async function saveSettings(e: React.FormEvent) {
        e.preventDefault();
        if (!settings) return;
        setBusy('settings');
        try {
            const library = await api<LibraryResponse>('settings', 'PUT', {
                name: settings.name,
                source: settings.source,
                destination: settings.destination
            });
            setData(library);
            setSettings(library.config);
            setSelected(new Set());
            setInspecting(library.assets[0]?.id || null);
            notify('Workspace connected successfully.');
            setView('library');
        } catch (e) {
            notify((e as Error).message, true);
        } finally {
            setBusy('');
        }
    }

    function navigate(next: View, nextCategory: AssetType | 'all' = 'all') {
        console.log(`Navigating to ${next} with category ${nextCategory}`);
        setView(next);
        setCategory(nextCategory);
        setSelected(new Set());
        setQuery('');
        setStatus('all');
        setFormat('all');
    }

    const assets = data?.assets || [];
    const pending = assets.filter(a => a.status !== 'synced');
    const synced = assets.length - pending.length;
    const filtered = useMemo(() => assets.filter(a =>
        (view !== 'pending' || a.status !== 'synced') && (view !== 'synced' || a.status === 'synced') &&
        (category === 'all' || a.type === category) && (format === 'all' || a.extension === format) &&
        (status === 'all' || a.status === status) && `${a.name} ${a.path}`.toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : b.modifiedAt.localeCompare(a.modifiedAt)), [assets, view, category, format, status, query, sort]);
    const inspected = assets.find(a => a.id === inspecting);
    const selectedPending = assets.filter(a => selected.has(a.id) && a.status !== 'synced');
    const syncAssets = assets.filter(a => syncIds?.includes(a.id) && a.status !== 'synced');
    const allVisibleSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id));
    const toggle = (id: string) => setSelected(previous => {
        const next = new Set(previous);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const pageName = {
        library: 'Asset library',
        pending: 'Needs sync',
        synced: 'In sync',
        activity: 'Sync activity',
        settings: 'Workspace settings'
    }[view];
    const types = ['texture', 'model', 'material', 'audio'] as const;
    if (stopped) return <div className="startup-state">
        <div className="brand-mark"><CheckCheck/></div>
        <h1>Workspace closed.</h1><p>Your files, settings, and history are saved on your machine.<br/>Launch GDA Sync to
        pick up where you left off.</p></div>;
    if (error) return <div className="startup-state">
        <div className="brand-mark"><RefreshCw/></div>
        <h1>Couldn’t connect to your workspace</h1><p>{error}</p>
        <button className="button primary" onClick={() => window.location.reload()}><RefreshCw size={16}/>Try again
        </button>
    </div>;
    if (!data) return <div className="startup-state">
        <div className="brand-mark"><RefreshCw className="spin"/></div>
        <h1>Opening your workspace</h1><p>Getting your assets ready…</p></div>;
    return <div className="app-shell">
        <aside className="sidebar">
            <a className="brand" href="#" onClick={e => {
                e.preventDefault();
                navigate('library');
            }}><span className="brand-mark"><RefreshCw size={24} strokeWidth={2}/></span><span>GDA<span
                className="brand-light"> Sync</span></span></a>
            <div className="workspace-label">WORKSPACE</div>
            <button className="workspace-switch" onClick={() => navigate('settings')}><span
                className="workspace-avatar"><Sparkles
                size={17}/></span><span><strong>{data.config.name}</strong><small>{data.config.demo ? 'Environment demo' : 'Asset workspace'}</small></span><ChevronDown
                size={14}/></button>
            <nav aria-label="Main navigation" className="main-nav">
                <button aria-label="Asset library" className={view === 'library' && category === 'all' ? 'active' : ''}
                        onClick={() => navigate('library')}><LayoutGrid
                    size={18}/><span>Asset library</span><b>{assets.length}</b></button>
                <button aria-label="Needs sync" className={view === 'pending' ? 'active' : ''}
                        onClick={() => navigate('pending')}><RefreshCw size={18}/><span>Needs sync</span><b
                    className="pending-count">{pending.length}</b></button>
                <button aria-label="In sync" className={view === 'synced' ? 'active' : ''}
                        onClick={() => navigate('synced')}><CheckCheck size={18}/><span>In sync</span><b>{synced}</b>
                </button>
                <button aria-label="Sync activity" className={view === 'activity' ? 'active' : ''}
                        onClick={() => navigate('activity')}><Clock3 size={18}/><span>Sync activity</span></button>
            </nav>
            <div className="sidebar-divider"/>
            <div className="workspace-label">ASSET TYPES</div>
            <nav aria-label="Asset types" className="type-nav">{types.map(type => {
                const Icon = typeIcons[type];
                return <button aria-label={typeNames[type]} key={type}
                               className={category === type && view === 'library' ? 'active' : ''}
                               onClick={() => navigate('library', type)}><Icon size={17}/><span>{typeNames[type]}</span><small>{assets.filter(a => a.type === type).length}</small>
                </button>;
            })}</nav>
            <div className="sidebar-bottom">
                <div className="local-note"><ShieldCheck size={21}/><strong>At home on your machine.</strong><p>Your
                    files stay local.<br/>Your workflow stays yours.</p><span>NO CLOUD REQUIRED <ArrowUpRight
                    size={12}/></span></div>
                <button aria-label="Workspace settings"
                        className={`settings-nav ${view === 'settings' ? 'active' : ''}`}
                        onClick={() => navigate('settings')}><Settings2 size={18}/>Workspace settings
                </button>
                <div className="sidebar-profile">
                    <div className="profile-avatar">VS</div>
                    <div><strong>Studio workspace</strong><span><i/>Ubuntu · local</span></div>
                    <span className="version">v{packageInfo.version}</span></div>
            </div>
        </aside>
        <div className="workspace-main">
            <header className="topbar">
                <div className="breadcrumb"><Folder size={15}/><span>{data.config.name}</span><ChevronRight
                    size={13}/><strong>{pageName}</strong></div>
                <div className="topbar-right"><span className="connection"><i/>Local connection</span><span
                    className="topbar-divider"/>
                    <button className="icon-button" aria-label="Help and keyboard shortcuts"
                            onClick={() => setHelp(true)}><CircleHelp size={19}/></button>
                    <div className="top-avatar">VS</div>
                </div>
            </header>
            <main className="main-content">
                <div className="page-heading">
                    <div>
                        <div className="eyebrow">YOUR CREATIVE WORKFLOW, CONNECTED</div>
                        <h1>{pageName}<span className="heading-dot">.</span></h1>
                        <p>{view === 'activity' ? 'A little history of everything you’ve moved forward.' : view === 'settings' ? 'Connect your source assets to their home in GDA.' : 'A place for every asset. Everything in its right place.'}</p>
                    </div>
                    {view !== 'settings' && <div className="heading-actions">
                        <button className="button secondary" onClick={rescan} disabled={!!busy}>{busy === 'scan' ?
                            <LoaderCircle className="spin" size={15}/> : <RefreshCw size={15}/>}Rescan
                        </button>
                        <button className="button primary" disabled={!!busy || !pending.length}
                                onClick={() => setSyncIds(pending.map(a => a.id))}>{busy === 'sync' ?
                            <LoaderCircle className="spin" size={16}/> : <RefreshCw
                                size={16}/>}{busy === 'sync' ? 'Syncing…' : 'Sync all pending'}{pending.length > 0 &&
                            <span className="button-count">{pending.length}</span>}</button>
                    </div>}
                </div>
                {view !== 'settings' && view !== 'activity' && <>
                    <div className="stats-row">
                        <button className="stat-card" onClick={() => navigate('library')}><span
                            className="stat-icon neutral"><Layers size={21}/></span>
                            <div><span className="stat-label">Total assets</span>
                                <div className="stat-value">{assets.length}<span>in your workspace</span></div>
                            </div>
                            <ArrowUpRight className="stat-arrow" size={17}/></button>
                        <button className="stat-card" onClick={() => navigate('pending')}><span
                            className="stat-icon amber"><RefreshCw size={21}/></span>
                            <div><span className="stat-label">Ready to sync</span>
                                <div
                                    className="stat-value">{pending.length}<span>{assets.filter(a => a.status === 'new').length} new · {assets.filter(a => a.status === 'modified').length} modified</span>
                                </div>
                            </div>
                            <ArrowUpRight className="stat-arrow" size={17}/></button>
                        <button className="stat-card" onClick={() => navigate('synced')}><span
                            className="stat-icon green"><CheckCheck size={21}/></span>
                            <div><span className="stat-label">Already in sync</span>
                                <div className="stat-value">{synced}<span>good to go</span></div>
                            </div>
                            <span className="mini-progress"><i
                                style={{height: `${assets.length ? synced / assets.length * 100 : 0}%`}}/></span>
                        </button>
                    </div>
                    <div className="folder-connection">
                        <div className="folder-endpoint"><span className="endpoint-icon"><FolderOpen size={19}/></span>
                            <div><span className="endpoint-label">SOURCE FOLDER</span>
                                <button title={data.config.source} className="path-button"
                                        onClick={() => openFolder('source')}>{data.config.demo ? '…/demo/source' : data.config.source}<ExternalLink
                                    size={12}/></button>
                            </div>
                            <button className="icon-button copy-folder" aria-label="Copy source folder path"
                                    onClick={() => copy(data.config.source)}><Copy size={14}/></button>
                        </div>
                        <span className="connection-arrow"><ArrowRight size={18}/></span>
                        <div className="folder-endpoint"><span className="endpoint-icon green"><FolderOpen
                            size={19}/></span>
                            <div><span className="endpoint-label">GDA DESTINATION</span>
                                <button title={data.config.destination} className="path-button"
                                        onClick={() => openFolder('destination')}>{data.config.demo ? '…/demo/gda' : data.config.destination}<ExternalLink
                                    size={12}/></button>
                            </div>
                            <button className="icon-button copy-folder" aria-label="Copy GDA folder path"
                                    onClick={() => copy(data.config.destination)}><Copy size={14}/></button>
                        </div>
                        <button className="connection-settings icon-button" aria-label="Change workspace folders"
                                onClick={() => navigate('settings')}><Settings2 size={17}/></button>
                    </div>
                    {data.warnings.length > 0 &&
                        <div className="warning-banner" role="status">{data.warnings.length} files skipped during
                            scan. <details>
                                <summary>View details</summary>
                                {data.warnings.map(w => <p key={w}>{w}</p>)}</details></div>}
                    <div className="library-toolbar">
                        <div className="category-tabs">
                            <button className={category === 'all' ? 'active' : ''} onClick={() => {
                                setCategory('all');
                                setSelected(new Set());
                            }}>All assets <span>{assets.length}</span></button>
                            {types.map(type => <button className={category === type ? 'active' : ''} key={type}
                                                       onClick={() => {
                                                           setCategory(type);
                                                           setSelected(new Set());
                                                       }}>{typeNames[type]}</button>)}</div>
                        <div className="layout-toggle">
                            <button className={layout === 'grid' ? 'active' : ''} aria-label="Grid view"
                                    aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2
                                size={16}/></button>
                            <button className={layout === 'list' ? 'active' : ''} aria-label="List view"
                                    aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={17}/>
                            </button>
                        </div>
                    </div>
                    <div className="filter-row">
                        <div className="search-box"><Search size={17}/><input ref={searchRef} aria-label="Search assets"
                                                                              placeholder="Search assets, names, or folders…"
                                                                              value={query}
                                                                              onChange={e => setQuery(e.target.value)}/>{query ?
                            <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X
                                size={14}/></button> : <kbd>Ctrl K</kbd>}</div>
                        <div className="select-wrap"><SlidersHorizontal size={14}/><select aria-label="Filter by status"
                                                                                           value={status}
                                                                                           onChange={e => setStatus(e.target.value as AssetStatus | 'all')}>
                            <option value="all">All statuses</option>
                            <option value="new">New assets</option>
                            <option value="modified">Modified</option>
                            <option value="synced">In sync</option>
                        </select><ChevronDown size={13}/></div>
                        <div className="select-wrap format-select"><select aria-label="Filter by file format"
                                                                           value={format}
                                                                           onChange={e => setFormat(e.target.value)}>
                            <option value="all">All formats</option>
                            {[...new Set(assets.map(a => a.extension))].sort().map(ext => <option key={ext}
                                                                                                  value={ext}>{ext.toUpperCase()}</option>)}
                        </select><ChevronDown size={13}/></div>
                        <div className="select-wrap sort-select"><ArrowDown size={14}/><select aria-label="Sort assets"
                                                                                               value={sort}
                                                                                               onChange={e => setSort(e.target.value)}>
                            <option value="recent">Recently modified</option>
                            <option value="name">Name A–Z</option>
                            <option value="size">Largest first</option>
                        </select><ChevronDown size={13}/></div>
                    </div>
                    <div className="results-heading"><label className="select-all"><input type="checkbox"
                                                                                          aria-label="Select all visible assets"
                                                                                          checked={allVisibleSelected}
                                                                                          onChange={() => setSelected(previous => {
                                                                                              const next = new Set(previous);
                                                                                              filtered.forEach(a => allVisibleSelected ? next.delete(a.id) : next.add(a.id));
                                                                                              return next;
                                                                                          })}/><span>{selected.size ? `${selected.size} selected` : `${filtered.length} assets`}<small>{query && ` matching “${query}”`}</small></span></label><span
                        className="scan-time"><i/>Last scanned {time(data.scannedAt)}</span></div>
                    <div className={`library-content ${inspected ? 'with-inspector' : ''}`}>
                        <div className="asset-area">
                            {filtered.length ? <div className={`asset-${layout}`}>{filtered.map(asset => {
                                    const Icon = typeIcons[asset.type];
                                    return <article key={asset.id}
                                                    className={`asset-card ${inspecting === asset.id ? 'inspected' : ''} ${selected.has(asset.id) ? 'selected' : ''}`}>
                                        <button className="asset-hit-target" aria-label={`Inspect ${asset.name}`}
                                                onClick={() => setInspecting(asset.id)}><Thumbnail asset={asset}
                                                                                                   revision={data.scannedAt}/>
                                            <div className="asset-info">
                                                <div className="asset-title"><Icon size={14}/><strong
                                                    title={asset.name}>{asset.name}</strong></div>
                                                <div className="asset-subtitle">
                                                    <span>{asset.folder}</span><span>{size(asset.size)}</span></div>
                                                <div className="asset-card-bottom"><Status status={asset.status}/><span
                                                    className="dimension-label">{asset.dimensions ? `${asset.dimensions.width} × ${asset.dimensions.height}` : asset.extension.toUpperCase()}</span>
                                                </div>
                                            </div>
                                        </button>
                                        <input className="asset-checkbox" type="checkbox"
                                               aria-label={`Select ${asset.name}`} checked={selected.has(asset.id)}
                                               onChange={() => toggle(asset.id)}/>
                                        <button className="asset-menu" aria-label={`Show details for ${asset.name}`}
                                                onClick={() => setInspecting(asset.id)}><MoreHorizontal size={17}/></button>
                                    </article>;
                                })}</div> :
                                <div className="empty-state">{view === 'pending' && !query ? <CheckCheck size={36}/> :
                                    <Search size={34}/>}
                                    <h2>{view === 'pending' && !query ? 'All caught up.' : 'No assets found'}</h2>
                                    <p>{view === 'pending' && !query ? 'Every asset is in sync with your GDA folder.' : 'Try a different search or clear your filters.'}</p>
                                    <button className="button secondary" onClick={() => {
                                        setQuery('');
                                        setCategory('all');
                                        setStatus('all');
                                        setFormat('all');
                                        if (view === 'pending') setView('library');
                                    }}>Show all assets
                                    </button>
                                </div>}
                        </div>
                        {inspected && <aside className="inspector" aria-label="Asset details">
                            <div className="inspector-heading"><span>ASSET DETAILS</span>
                                <button className="icon-button" aria-label="Close asset details"
                                        onClick={() => setInspecting(null)}><X size={15}/></button>
                            </div>
                            <button className="preview-button" aria-label={`Enlarge ${inspected.name} preview`}
                                    onClick={() => setExpanded(true)}><Thumbnail asset={inspected} large
                                                                                 revision={data.scannedAt}/><span
                                className="expand-preview"><ArrowUpRight size={16}/></span></button>
                            <div className="inspector-body"><Status status={inspected.status}/><h2>{inspected.name}</h2>
                                <span className="inspector-folder"><Folder size={12}/>{inspected.folder}</span>
                                <div className="detail-grid">
                                    <div><span>FILE FORMAT</span><strong>{inspected.extension.toUpperCase()}</strong>
                                    </div>
                                    <div><span>FILE SIZE</span><strong>{size(inspected.size)}</strong></div>
                                    {inspected.dimensions && <>
                                        <div>
                                            <span>RESOLUTION</span><strong>{inspected.dimensions.width} × {inspected.dimensions.height}</strong>
                                        </div>
                                        <div><span>PIXEL FORMAT</span><strong>{inspected.dimensions.format}</strong>
                                        </div>
                                    </>}</div>
                                <div className="modified-detail">
                                    <span>LAST MODIFIED</span><strong>{time(inspected.modifiedAt)}</strong></div>
                                {inspected.extension === 'dds' && <div className="dds-note"><Image
                                    size={15}/><span>{inspected.preview ? 'DDS preview supported' : 'DDS preview unavailable'}<small>{inspected.dimensions?.mipmaps || 1} mip level{(inspected.dimensions?.mipmaps || 1) > 1 ? 's' : ''} · original preserved</small></span>
                                </div>}
                                <div className={`sync-note ${inspected.status === 'synced' ? 'is-synced' : ''}`}>
                                    <span>{inspected.status === 'synced' ? <CheckCheck size={16}/> :
                                        <RefreshCw size={16}/>}</span>
                                    <p>{inspected.status === 'new' ? 'A fresh addition.' : inspected.status === 'modified' ? 'A newer version is ready.' : 'Everything looks good.'}<small>{inspected.status === 'synced' ? 'Source and GDA files match.' : inspected.status === 'new' ? 'This asset hasn’t been copied to GDA yet.' : 'Sync to update the copy in GDA.'}</small>
                                    </p></div>
                                <button className="button primary inspector-sync"
                                        disabled={!!busy || inspected.status === 'synced'}
                                        onClick={() => setSyncIds([inspected.id])}>{inspected.status === 'synced' ?
                                    <Check size={15}/> : <RefreshCw
                                        size={15}/>}{inspected.status === 'synced' ? 'Already in sync' : 'Sync this asset'}</button>
                                <div className="inspector-links">
                                    <button onClick={() => openFolder('source', inspected.id)}><FolderOpen size={14}/>Open
                                        source<ArrowUpRight size={13}/></button>
                                    <button onClick={() => copy(`${data.config.source}/${inspected.path}`)}><Copy
                                        size={14}/>Copy path
                                    </button>
                                </div>
                            </div>
                        </aside>}</div>
                    {selected.size > 0 &&
                        <div className="selection-bar"><span><Check size={16}/>{selected.size} assets selected</span>
                            <button onClick={() => setSelected(new Set())}>Clear selection</button>
                            <button className="button primary" disabled={!!busy || !selectedPending.length}
                                    onClick={() => setSyncIds(selectedPending.map(a => a.id))}><RefreshCw size={15}/>Sync
                                selected{selectedPending.length > 0 &&
                                    <span className="button-count">{selectedPending.length}</span>}</button>
                        </div>}
                    <footer className="content-footer"><span><ShieldCheck
                        size={13}/>Made for your local workflow.</span><span>{data.config.demo ? 'Demo workspace' : 'Connected workspace'}<i/>{size(assets.reduce((sum, a) => sum + a.size, 0))} total</span>
                    </footer>
                </>}
                {view === 'activity' && <div className="activity-panel">
                    <div className="panel-heading"><h2>A trail of good work</h2>
                        <span>{data.activity.length} operations</span></div>
                    {data.activity.length ? data.activity.map(activity => <div className="activity-item"
                                                                               key={activity.id}><span
                            className={`activity-icon ${activity.action === 'sync' ? 'green' : ''}`}>{activity.action === 'sync' ?
                            <CheckCheck size={19}/> : activity.action === 'scan' ? <Search size={19}/> :
                                <Settings2 size={19}/>}</span>
                            <div><strong>{activity.message}</strong>
                                <p>{time(activity.date)}{activity.bytes !== undefined && ` · ${size(activity.bytes)} copied`}</p>{activity.files.length > 0 &&
                                    <details>
                                        <summary>View {activity.files.length} files</summary>
                                        {activity.files.map(file => <span key={file} className="activity-file"><File
                                            size={13}/>{file}</span>)}</details>}</div>
                            <span className="activity-done"><Check size={12}/>Complete</span></div>) :
                        <div className="empty-state"><Clock3 size={38}/><h2>Your next sync starts the story.</h2><p>Sync
                            some assets or rescan your workspace to see activity here.</p>
                            <button className="button primary" onClick={() => navigate('library')}>Explore your
                                assets<ArrowRight size={15}/></button>
                        </div>}</div>}
                {view === 'settings' && settings && <div className="settings-layout">
                    <form className="settings-panel" onSubmit={saveSettings}>
                        <div className="panel-heading"><h2>Workspace connection</h2><span
                            className="connected-badge"><i/>Connected</span></div>
                        <div className="form-body"><label>Project name<input required maxLength={80}
                                                                             value={settings.name}
                                                                             onChange={e => setSettings({
                                                                                 ...settings,
                                                                                 name: e.target.value
                                                                             })}
                                                                             placeholder="Your project name"/></label><label><span><FolderOpen
                            size={16}/>Source folder</span><input aria-label="Source folder"
                                                                  aria-describedby="source-help" required
                                                                  value={settings.source} onChange={e => setSettings({
                            ...settings,
                            source: e.target.value
                        })} placeholder="/home/you/project/source"/><small id="source-help">The originals you’re working
                            with. All subfolders are included.</small></label>
                            <div className="form-connection"><ArrowDown
                                size={19}/><span>Assets flow from source to GDA</span></div>
                            <label><span><HardDrive size={16}/>GDA destination</span><input aria-label="GDA destination"
                                                                                            aria-describedby="destination-help"
                                                                                            required
                                                                                            value={settings.destination}
                                                                                            onChange={e => setSettings({
                                                                                                ...settings,
                                                                                                destination: e.target.value
                                                                                            })}
                                                                                            placeholder="/home/you/project/gda"/><small
                                id="destination-help">An existing, separate folder where your synced assets
                                belong.</small></label>
                            <div className="form-actions">
                                <button type="button" className="button secondary" onClick={() => {
                                    setSettings(data.config);
                                    navigate('library');
                                }}>Cancel
                                </button>
                                <button className="button primary" type="submit"
                                        disabled={!!busy}>{busy === 'settings' ?
                                    <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}Save connection
                                </button>
                            </div>
                        </div>
                    </form>
                    <div className="settings-explainer"><ShieldCheck size={28}/><h2>A simple, local connection.</h2>
                        <p>GDA Sync copies assets from your source folder to your destination, keeping the same folder
                            structure.</p>
                        <ul>
                            <li><Check size={15}/>Original source files are preserved</li>
                            <li><Check size={15}/>Existing GDA versions are backed up</li>
                            <li><Check size={15}/>File contents determine sync status</li>
                            <li><Check size={15}/>No uploads or cloud accounts</li>
                        </ul>
                        <div className="backup-location"><strong>Your backups live
                            here</strong><code>{data.backupPath}</code></div>
                        <div className="stop-application">
                            <button className="button secondary" disabled={!!busy}
                                    onClick={() => setShutdownConfirm(true)}><Power size={15}/>Stop application
                            </button>
                            <small>Close the local server when you’re done.</small></div>
                    </div>
                </div>}
            </main>
        </div>
        {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status">{toast.error ?
            <CircleHelp size={19}/> : <CheckCheck size={19}/>}<span>{toast.text}</span>
            <button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16}/></button>
        </div>}
        {syncIds && <Modal title="Ready to bring things up to date?" onClose={syncClose}>
            <div className="modal-body"><p>Copy {syncAssets.length} asset{syncAssets.length === 1 ? '' : 's'} from your
                source folder to GDA. Existing destination files will be replaced, with their previous versions saved in
                your backups.</p>
                <div className="sync-summary">
                    <div><span>ASSETS TO SYNC</span><strong>{syncAssets.length}</strong></div>
                    <ArrowRight size={23}/>
                    <div><span>TOTAL SIZE</span><strong>{size(syncAssets.reduce((s, a) => s + a.size, 0))}</strong>
                    </div>
                </div>
                <div className="sync-file-list">{syncAssets.map(asset => <div key={asset.id}><File
                    size={15}/><span>{asset.name}</span><Status status={asset.status}/></div>)}</div>
                <div className="modal-folder"><FolderOpen size={16}/><span>{data.config.destination}</span></div>
            </div>
            <div className="modal-actions">
                <button className="button secondary" onClick={syncClose}>Cancel</button>
                <button className="button primary" disabled={!syncAssets.length} onClick={confirmSync}><RefreshCw
                    size={16}/>Sync {syncAssets.length} asset{syncAssets.length === 1 ? '' : 's'}</button>
            </div>
        </Modal>}
        {shutdownConfirm && <Modal title="Stop GDA Sync?" onClose={shutdownClose}>
            <div className="modal-body"><p>This stops the local server. Your files, settings, and sync history stay
                saved. Launch GDA Sync to open this workspace again.</p></div>
            <div className="modal-actions">
                <button className="button secondary" onClick={shutdownClose}>Keep working</button>
                <button className="button primary" onClick={stopApplication}><Power size={15}/>Stop application</button>
            </div>
        </Modal>}
        {help && <Modal title="A little help for your workflow" onClose={helpClose}>
            <div className="modal-body help-body"><p>Search and inspect your assets, then sync the files you’re ready to
                move to GDA.</p>
                <div><span className="help-number">01</span>
                    <div><strong>Explore your library</strong><p>Filter by type, file format, or sync status. Click any
                        asset to see its details and preview.</p></div>
                </div>
                <div><span className="help-number">02</span>
                    <div><strong>Choose what moves forward</strong><p>Select individual assets, or use “Sync all
                        pending” to copy every new and modified file.</p></div>
                </div>
                <div><span className="help-number">03</span>
                    <div><strong>Keep it fresh</strong><p>After editing your source files, use Rescan to compare them
                        with GDA again.</p></div>
                </div>
                <div className="shortcut-row"><span>Focus asset search</span><kbd>Ctrl / ⌘ K</kbd></div>
                <div className="shortcut-row"><span>Close a dialog</span><kbd>Esc</kbd></div>
                <p className="help-small">DDS previews: DXT1, DXT3, DXT5, RGB24/32 and DX10 BC7 (UNORM / sRGB). Other
                    DDS formats can still be copied. Model previews in this demo are illustrations.</p></div>
        </Modal>}
        {expanded && inspected && <Modal title={inspected.name} onClose={previewClose} wide>
            <div className="enlarged-preview"><Thumbnail asset={inspected} large revision={data.scannedAt}/></div>
            <div className="preview-caption">
                <span>{inspected.extension.toUpperCase()} · {size(inspected.size)}</span>{inspected.dimensions &&
                <span>{inspected.dimensions.width} × {inspected.dimensions.height} pixels</span>}</div>
        </Modal>}
    </div>;
}
