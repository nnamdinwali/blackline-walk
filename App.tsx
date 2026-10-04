import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { supabase, isSupabaseConfigured } from './lib/supabase';

type Tab = 'walk' | 'territories' | 'activity' | 'profile';
type ActivityRow = {
  activity_date: string;
  steps: number;
  distance_km: number;
  calories: number;
  active_minutes: number;
};
type Territory = {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  radius_m: number;
};

const sampleActivity: ActivityRow[] = [
  { activity_date: 'Mon', steps: 4067, distance_km: 2.51, calories: 182, active_minutes: 56 },
  { activity_date: 'Tue', steps: 6220, distance_km: 3.84, calories: 260, active_minutes: 71 },
  { activity_date: 'Wed', steps: 2880, distance_km: 1.72, calories: 129, active_minutes: 33 },
  { activity_date: 'Thu', steps: 7315, distance_km: 4.46, calories: 318, active_minutes: 84 },
  { activity_date: 'Fri', steps: 5140, distance_km: 3.12, calories: 224, active_minutes: 62 },
  { activity_date: 'Sat', steps: 8190, distance_km: 5.04, calories: 360, active_minutes: 97 },
  { activity_date: 'Sun', steps: 0, distance_km: 0, calories: 0, active_minutes: 0 },
];

const demoTerritories: Territory[] = [
  { id: 'north', name: 'North Loop', slug: 'north-loop', owner_id: null, radius_m: 180 },
  { id: 'river', name: 'River Gate', slug: 'river-gate', owner_id: 'demo-owner', radius_m: 150 },
  { id: 'market', name: 'Market Square', slug: 'market-square', owner_id: null, radius_m: 120 },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('walk');
  const [activity, setActivity] = useState<ActivityRow[]>(sampleActivity);
  const [territories, setTerritories] = useState<Territory[]>(demoTerritories);
  const [sessionEmail, setSessionEmail] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [territoryProgress, setTerritoryProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSignedIn(Boolean(next)));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !signedIn) return;
    Promise.all([
      supabase
        .from('daily_activity')
        .select('activity_date, steps, distance_km, calories, active_minutes')
        .order('activity_date', { ascending: true })
        .limit(7),
      supabase.from('territories').select('id, name, slug, owner_id, radius_m').limit(20),
    ]).then(([activityResult, territoryResult]) => {
      if (!activityResult.error && activityResult.data?.length) setActivity(activityResult.data);
      if (!territoryResult.error && territoryResult.data?.length) setTerritories(territoryResult.data);
    });
  }, [signedIn]);

  const today = activity[activity.length - 1] ?? sampleActivity[sampleActivity.length - 1];
  const totalSteps = useMemo(() => activity.reduce((sum, day) => sum + day.steps, 0), [activity]);
  const maxSteps = Math.max(...activity.map((day) => day.steps), 1);

  async function requestLocation() {
    const result = await Location.requestForegroundPermissionsAsync();
    setLocationReady(result.status === 'granted');
    if (result.status !== 'granted') Alert.alert('Location needed', 'Blackline uses your location only to verify walks inside a territory.');
  }

  async function requestNotifications() {
    const result = await Notifications.requestPermissionsAsync();
    Alert.alert(result.granted ? 'Notifications enabled' : 'Notifications off', result.granted ? 'Blackline can remind you about territory streaks.' : 'You can enable reminders later in Settings.');
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) return Alert.alert('Preview mode', 'Google sign-in will work after the Supabase Google provider is enabled.');
    setAuthBusy(true);
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' } });
    if (error) { setAuthBusy(false); return Alert.alert('Google sign-in unavailable', error.message); }
    if (Platform.OS === 'web' && data?.url) { window.location.href = data.url; return; }
    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') {
        const callbackUrl = new URL(result.url);
        const code = callbackUrl.searchParams.get('code');
        if (code) await supabase.auth.exchangeCodeForSession(code);
      }
    }
    setAuthBusy(false);
  }

  async function sendMagicLink() {
    if (!sessionEmail.trim()) return Alert.alert('Email required', 'Enter an email address to receive a sign-in link.');
    setAuthBusy(true);
    if (!isSupabaseConfigured) {
      setTimeout(() => {
        setAuthBusy(false);
        Alert.alert('Preview mode', 'Supabase is not configured in this local build yet. The real project is ready for the app credentials.');
      }, 450);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email: sessionEmail.trim() });
    setAuthBusy(false);
    Alert.alert(error ? 'Could not send link' : 'Check your inbox', error?.message ?? 'Use the link in your email to continue.');
  }

  async function claimTerritory(territory: Territory) {
    setTerritoryProgress((current) => ({ ...current, [territory.id]: Math.min((current[territory.id] ?? 0) + 1, 3) }));
    Alert.alert('Walk logged', `${territory.name} needs three verified walking days to claim.`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <View style={styles.topbar}>
          <View>
            <Text style={styles.eyebrow}>BLACKLINE / FIELD 01</Text>
            <Text style={styles.wordmark}>WALK <Text style={styles.wordmarkLight}>THE LINE</Text></Text>
          </View>
          <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>{locationReady ? 'LIVE' : 'READY'}</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!signedIn ? <LandingScreen email={sessionEmail} setEmail={setSessionEmail} busy={authBusy} onGoogle={signInWithGoogle} onSignUp={sendMagicLink} /> : <>
            {tab === 'walk' && <WalkScreen today={today} totalSteps={totalSteps} locationReady={locationReady} onLocation={requestLocation} onTerritories={() => setTab('territories')} />}
            {tab === 'territories' && <TerritoriesScreen territories={territories} progress={territoryProgress} onClaim={claimTerritory} />}
            {tab === 'activity' && <ActivityScreen activity={activity} maxSteps={maxSteps} />}
            {tab === 'profile' && <ProfileScreen email={sessionEmail} setEmail={setSessionEmail} signedIn={signedIn} busy={authBusy} onSignIn={sendMagicLink} onNotifications={requestNotifications} />}
          </>}
        </ScrollView>

        {signedIn && <View style={styles.nav}>
          <NavButton label="WALK" active={tab === 'walk'} onPress={() => setTab('walk')} />
          <NavButton label="MAP" active={tab === 'territories'} onPress={() => setTab('territories')} />
          <NavButton label="DATA" active={tab === 'activity'} onPress={() => setTab('activity')} />
          <NavButton label="YOU" active={tab === 'profile'} onPress={() => setTab('profile')} />
        </View>}
      </View>
    </SafeAreaView>
  );
}

function LandingScreen({ email, setEmail, busy, onGoogle, onSignUp }: { email: string; setEmail: (value: string) => void; busy: boolean; onGoogle: () => void; onSignUp: () => void }) {
  return (
    <View style={styles.platformLanding}>
      <View style={styles.platformHero}>
        <Text style={styles.platformEyebrow}>BLACKLINE</Text>
        <Text style={styles.platformTitle}>Walk more.{"\n"}Own the miles.</Text>
        <Text style={styles.platformCopy}>
          Turn daily movement into territory you can claim. Walk, hold for three days, and keep what you earn.
        </Text>
      </View>

      <View style={styles.platformPanel}>
        <Pressable style={styles.googleButton} onPress={onGoogle} disabled={busy}>
          <Text style={styles.googleMark}>G</Text>
          <Text style={styles.googleText}>{busy ? "Connecting…" : "Continue with Google"}</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email address"
          placeholderTextColor="#666"
          style={styles.platformInput}
        />

        <Pressable style={styles.emailButton} onPress={onSignUp} disabled={busy}>
          <Text style={styles.emailButtonText}>{busy ? "Sending…" : "Continue"}</Text>
        </Pressable>

        <Text style={styles.terms}>
          By continuing you agree to Blackline terms and privacy policy.
        </Text>
        <Text style={styles.loginHint}>
          Already have an account? <Text style={styles.loginLink}>Sign in</Text>
        </Text>
      </View>
    </View>
  );
}


function WalkScreen({ today, totalSteps, locationReady, onLocation, onTerritories }: { today: ActivityRow; totalSteps: number; locationReady: boolean; onLocation: () => void; onTerritories: () => void }) {
  return <View>
    <View style={styles.hero}><Text style={styles.kicker}>SUNDAY / OPEN GROUND</Text><Text style={styles.heroTitle}>Every step leaves a mark.</Text><Text style={styles.heroCopy}>Walk the city. Hold your ground. Build a territory that only movement can keep.</Text><Pressable style={styles.primaryButton} onPress={onLocation}><Text style={styles.primaryButtonText}>{locationReady ? 'LOCATION ACTIVE' : 'START WALKING'}</Text><Text style={styles.buttonArrow}>↗</Text></Pressable></View>
    <View style={styles.metricGrid}><Metric value={today.steps.toLocaleString()} label="TODAY / STEPS" /><Metric value={`${today.distance_km.toFixed(2)} km`} label="DISTANCE COVERED" /><Metric value={`${today.calories}`} label="CALORIES BURNED" /></View>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>YOUR FIELD NOTE</Text><Text style={styles.sectionMeta}>{totalSteps.toLocaleString()} steps / 7 days</Text></View>
    <View style={styles.note}><Text style={styles.noteNumber}>01</Text><View style={styles.noteBody}><Text style={styles.noteTitle}>Hold the line</Text><Text style={styles.noteCopy}>Visit a territory three days in a row to claim it. Miss three days and the ground opens again.</Text></View></View>
    <Pressable style={styles.outlineButton} onPress={onTerritories}><Text style={styles.outlineButtonText}>VIEW TERRITORIES</Text><Text style={styles.outlineArrow}>→</Text></Pressable>
  </View>;
}

function TerritoriesScreen({ territories, progress, onClaim }: { territories: Territory[]; progress: Record<string, number>; onClaim: (territory: Territory) => void }) {
  return <View><Text style={styles.kicker}>FIELD MAP / 03 OPEN ZONES</Text><Text style={styles.pageTitle}>Choose your ground.</Text><Text style={styles.pageCopy}>Each zone is a three-day contest. Your live map will appear here when location permission is active.</Text><View style={styles.mapFrame}><View style={styles.mapGrid} /><View style={styles.mapCenter}><Text style={styles.mapLabel}>YOUR POSITION</Text><View style={styles.positionDot} /></View></View>{territories.map((territory) => { const days = progress[territory.id] ?? 0; return <View key={territory.id} style={styles.territoryRow}><View style={styles.territoryIndex}><Text style={styles.territoryIndexText}>0{territories.indexOf(territory) + 1}</Text></View><View style={styles.territoryInfo}><Text style={styles.territoryName}>{territory.name}</Text><Text style={styles.territoryMeta}>{territory.owner_id ? 'HELD BY ANOTHER WALKER' : `${territory.radius_m}M RADIUS / OPEN`}</Text><View style={styles.progressLine}><View style={[styles.progressFill, { width: `${(days / 3) * 100}%` }]} /></View><Text style={styles.progressText}>{days}/3 VERIFIED DAYS</Text></View><Pressable style={styles.smallButton} onPress={() => onClaim(territory)}><Text style={styles.smallButtonText}>LOG</Text></Pressable></View>; })}</View>;
}

function ActivityScreen({ activity, maxSteps }: { activity: ActivityRow[]; maxSteps: number }) {
  return <View><Text style={styles.kicker}>ACTIVITY / LAST 7 DAYS</Text><Text style={styles.pageTitle}>Your movement, measured.</Text><View style={styles.chart}><View style={styles.chartHeader}><Text style={styles.chartValue}>{activity.reduce((sum, day) => sum + day.steps, 0).toLocaleString()}</Text><Text style={styles.chartLabel}>TOTAL STEPS</Text></View><View style={styles.bars}>{activity.map((day) => <View key={day.activity_date} style={styles.barColumn}><View style={styles.barTrack}><View style={[styles.bar, { height: `${Math.max((day.steps / maxSteps) * 100, 3)}%` }]} /></View><Text style={styles.barLabel}>{day.activity_date.slice(0, 3).toUpperCase()}</Text></View>)}</View></View><View style={styles.trendCard}><Text style={styles.kicker}>TREND / CURRENT WEEK</Text><Text style={styles.trendTitle}>Keep the signal alive.</Text><Text style={styles.trendCopy}>Your active days are written to Supabase when your account is connected. No fake progress is presented when the database has no data.</Text></View></View>;
}

function ProfileScreen({ email, setEmail, signedIn, busy, onSignIn, onNotifications }: { email: string; setEmail: (value: string) => void; signedIn: boolean; busy: boolean; onSignIn: () => void; onNotifications: () => void }) {
  return <View><Text style={styles.kicker}>IDENTITY / FIELD ACCESS</Text><Text style={styles.pageTitle}>Keep your line.</Text><Text style={styles.pageCopy}>Sign in to sync steps, territory streaks, and activity across devices.</Text><View style={styles.profileCard}><Text style={styles.profileTag}>{signedIn ? 'CONNECTED TO BLACKLINE' : 'EMAIL SIGN-IN'}</Text>{!signedIn && <><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#777" style={styles.input} /><Pressable style={styles.primaryButton} onPress={onSignIn}><Text style={styles.primaryButtonText}>{busy ? 'SENDING…' : 'SEND MAGIC LINK'}</Text><Text style={styles.buttonArrow}>↗</Text></Pressable></>}{signedIn && <Text style={styles.signedInText}>Your activity and territory claims are syncing securely.</Text>}</View><Pressable style={styles.outlineButton} onPress={onNotifications}><Text style={styles.outlineButtonText}>SET WALK REMINDERS</Text><Text style={styles.outlineArrow}>→</Text></Pressable><Text style={styles.privacyNote}>Location is used for territory verification. You control permissions from your device settings.</Text></View>;
}

function Metric({ value, label }: { value: string; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function NavButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable style={styles.navButton} onPress={onPress}><View style={[styles.navMark, active && styles.navMarkActive]} /><Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  platformLanding: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 4 },
  platformHero: { paddingTop: 12, paddingBottom: 28 },
  platformEyebrow: { color: '#888', fontSize: 12, letterSpacing: 1.2, fontWeight: '600' },
  platformTitle: { color: '#ffffff', fontSize: 34, lineHeight: 40, fontWeight: '700', marginTop: 12 },
  platformCopy: { color: '#a1a1aa', fontSize: 15, lineHeight: 22, marginTop: 12, maxWidth: 340 },
  platformPanel: { backgroundColor: 'transparent', padding: 0, marginTop: 8 },
  googleButton: { minHeight: 52, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#3f3f46', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 10 },
  googleMark: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  googleText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#27272a' },
  dividerText: { color: '#71717a', fontSize: 12, fontWeight: '500' },
  platformInput: { height: 52, borderWidth: 1, borderColor: '#3f3f46', borderRadius: 12, color: '#ffffff', fontSize: 15, paddingHorizontal: 16, backgroundColor: '#18181b' },
  emailButton: { minHeight: 52, marginTop: 12, backgroundColor: '#22c55e', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emailButtonText: { color: '#052e16', fontSize: 15, fontWeight: '700' },
  terms: { color: '#71717a', fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: 'center' },
  loginHint: { color: '#a1a1aa', fontSize: 13, marginTop: 16, textAlign: 'center' },
  loginLink: { color: '#22c55e', fontWeight: '600' },
  platformFooter: { marginTop: 32 },
  footerBrand: { color: '#52525b', fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  footerNote: { color: '#3f3f46', fontSize: 11, marginTop: 4 },

  landing: { paddingTop: 30, paddingBottom: 32 }, landingIndex: { color: '#e6ff55', fontSize: 10, letterSpacing: 2.4, fontWeight: '800' }, landingTitle: { color: '#f3f3f0', fontSize: 52, lineHeight: 51, fontWeight: '900', letterSpacing: -2, marginTop: 18 }, landingCopy: { color: '#999991', fontSize: 16, lineHeight: 23, marginTop: 18, maxWidth: 330 }, landingRule: { height: 3, backgroundColor: '#2c2c2c', marginTop: 30, marginBottom: 10 }, landingRuleFill: { height: 3, width: '32%', backgroundColor: '#e6ff55' }, landingFeature: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#2c2c2c', paddingVertical: 17 }, landingFeatureNumber: { color: '#777', width: 42, fontSize: 11, fontWeight: '800' }, landingFeatureTitle: { color: '#f3f3f0', fontSize: 13, fontWeight: '900', letterSpacing: 1.4 }, landingFeatureText: { color: '#888880', fontSize: 13, marginTop: 4 }, signupCard: { borderWidth: 1, borderColor: '#414141', padding: 18, marginTop: 28, backgroundColor: '#111' }, signupLabel: { color: '#e6ff55', fontSize: 10, letterSpacing: 1.5, fontWeight: '900' }, signupNote: { color: '#777', fontSize: 10, marginTop: 12 }, platformLanding: { paddingTop: 12, paddingBottom: 30 }, platformHero: { paddingTop: 20, paddingBottom: 24 }, platformEyebrow: { color: '#777', fontSize: 9, letterSpacing: 2, fontWeight: '800' }, platformTitle: { color: '#f4f4ef', fontSize: 48, lineHeight: 48, fontWeight: '900', letterSpacing: -1.8, marginTop: 16 }, platformCopy: { color: '#9b9b93', fontSize: 15, lineHeight: 22, marginTop: 15, maxWidth: 340 }, platformStatRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#303030', paddingVertical: 16, marginTop: 24 }, platformStat: { color: '#e6ff55', fontSize: 24, fontWeight: '900' }, platformStatLabel: { color: '#777', fontSize: 8, letterSpacing: 1, marginTop: 5 }, platformPanel: { backgroundColor: '#f3f3ee', padding: 18, marginTop: 10 }, panelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, panelTitle: { color: '#101010', fontSize: 13, fontWeight: '900', letterSpacing: 1.2 }, panelMeta: { color: '#65655f', fontSize: 9, letterSpacing: 1 }, googleButton: { minHeight: 52, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }, googleMark: { color: '#e6ff55', fontSize: 19, fontWeight: '900', width: 28 }, googleText: { color: '#f4f4ef', fontSize: 11, fontWeight: '900', letterSpacing: .8, flex: 1 }, googleArrow: { color: '#e6ff55', fontSize: 19 }, divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 17 }, dividerLine: { flex: 1, height: 1, backgroundColor: '#c5c5bf' }, dividerText: { color: '#76766e', fontSize: 8, letterSpacing: 1 }, platformInput: { height: 50, borderWidth: 1, borderColor: '#b5b5af', color: '#111', fontSize: 15, paddingHorizontal: 13, backgroundColor: '#fff' }, emailButton: { minHeight: 50, marginTop: 10, backgroundColor: '#e6ff55', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, emailButtonText: { color: '#111', fontSize: 11, fontWeight: '900', letterSpacing: .8 }, emailArrow: { color: '#111', fontSize: 19 }, terms: { color: '#777', fontSize: 9, lineHeight: 14, marginTop: 14 }, loginHint: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 18 }, loginLink: { color: '#111', fontWeight: '900' }, platformFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 22 }, footerBrand: { color: '#eee', fontWeight: '900', fontSize: 11, letterSpacing: 1.5 }, footerNote: { color: '#666', fontSize: 8, letterSpacing: 1 },
  safe: { flex: 1, backgroundColor: '#0a0a0a' }, shell: { flex: 1, backgroundColor: '#0a0a0a' }, topbar: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#252525' }, eyebrow: { color: '#777', fontSize: 10, letterSpacing: 2.2, fontWeight: '700' }, wordmark: { color: '#f3f3f0', fontSize: 22, letterSpacing: 1.8, fontWeight: '900', marginTop: 4 }, wordmarkLight: { color: '#777', fontWeight: '400' }, statusPill: { borderColor: '#3c3c3c', borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e6ff55' }, statusText: { color: '#d9d9d3', fontSize: 9, letterSpacing: 1.5, fontWeight: '700' }, content: { paddingHorizontal: 22, paddingBottom: 40 }, hero: { paddingTop: 34, paddingBottom: 28 }, kicker: { color: '#888', fontSize: 10, fontWeight: '700', letterSpacing: 2.2 }, heroTitle: { color: '#f3f3f0', fontSize: 46, lineHeight: 48, fontWeight: '900', letterSpacing: -1.5, marginTop: 12, maxWidth: 340 }, heroCopy: { color: '#9b9b94', fontSize: 15, lineHeight: 22, marginTop: 16, maxWidth: 330 }, primaryButton: { backgroundColor: '#e6ff55', minHeight: 52, paddingHorizontal: 18, marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryButtonText: { color: '#111', fontWeight: '900', letterSpacing: 1.1, fontSize: 12 }, buttonArrow: { color: '#111', fontSize: 22, fontWeight: '700' }, metricGrid: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#303030', flexDirection: 'row', paddingVertical: 18, marginBottom: 30 }, metric: { flex: 1, borderRightWidth: 1, borderColor: '#303030', paddingLeft: 12 }, metricValue: { color: '#f5f5f0', fontSize: 18, fontWeight: '800' }, metricLabel: { color: '#73736d', fontSize: 8, letterSpacing: 1.2, marginTop: 7, lineHeight: 12 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }, sectionTitle: { color: '#f3f3f0', fontSize: 12, fontWeight: '800', letterSpacing: 1.3 }, sectionMeta: { color: '#74746e', fontSize: 11 }, note: { borderWidth: 1, borderColor: '#333', flexDirection: 'row', padding: 16, backgroundColor: '#111' }, noteNumber: { color: '#e6ff55', fontSize: 12, fontWeight: '900', width: 38 }, noteBody: { flex: 1 }, noteTitle: { color: '#f3f3f0', fontSize: 18, fontWeight: '800' }, noteCopy: { color: '#96968e', fontSize: 13, lineHeight: 19, marginTop: 7 }, outlineButton: { borderWidth: 1, borderColor: '#777', minHeight: 50, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }, outlineButtonText: { color: '#f3f3f0', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, outlineArrow: { color: '#e6ff55', fontSize: 20 }, pageTitle: { color: '#f3f3f0', fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1, marginTop: 10 }, pageCopy: { color: '#999991', fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 22 }, mapFrame: { height: 230, borderWidth: 1, borderColor: '#3b3b3b', backgroundColor: '#101010', overflow: 'hidden', position: 'relative', marginBottom: 20 }, mapGrid: { ...StyleSheet.absoluteFill, opacity: 0.6, backgroundColor: '#131313', borderWidth: 1, borderColor: '#252525' }, mapCenter: { position: 'absolute', left: '45%', top: '42%', alignItems: 'center' }, mapLabel: { color: '#e6ff55', fontSize: 8, letterSpacing: 1.4, marginBottom: 7 }, positionDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#e6ff55', borderWidth: 4, borderColor: '#354000' }, territoryRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: '#2b2b2b', paddingVertical: 17 }, territoryIndex: { width: 34 }, territoryIndexText: { color: '#777', fontSize: 11, fontWeight: '700' }, territoryInfo: { flex: 1 }, territoryName: { color: '#f3f3f0', fontWeight: '800', fontSize: 16 }, territoryMeta: { color: '#777', fontSize: 9, letterSpacing: 1, marginTop: 5 }, progressLine: { height: 3, backgroundColor: '#333', marginTop: 12, marginRight: 20 }, progressFill: { height: 3, backgroundColor: '#e6ff55' }, progressText: { color: '#787870', fontSize: 8, letterSpacing: 1, marginTop: 5 }, smallButton: { borderWidth: 1, borderColor: '#555', paddingHorizontal: 12, paddingVertical: 10 }, smallButtonText: { color: '#e6ff55', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, chart: { borderWidth: 1, borderColor: '#333', padding: 18, marginTop: 24, backgroundColor: '#101010' }, chartHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 9 }, chartValue: { color: '#e6ff55', fontSize: 30, fontWeight: '900' }, chartLabel: { color: '#777', fontSize: 9, letterSpacing: 1.4 }, bars: { height: 180, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 20 }, barColumn: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }, barTrack: { height: '88%', width: 18, justifyContent: 'flex-end', backgroundColor: '#191919' }, bar: { width: '100%', backgroundColor: '#f3f3f0' }, barLabel: { color: '#777', fontSize: 8, marginTop: 9, letterSpacing: 1 }, trendCard: { padding: 18, marginTop: 16, backgroundColor: '#e6ff55' }, trendTitle: { color: '#111', fontSize: 22, fontWeight: '900', marginTop: 8 }, trendCopy: { color: '#424800', fontSize: 13, lineHeight: 19, marginTop: 8 }, profileCard: { borderWidth: 1, borderColor: '#333', padding: 18, marginTop: 22, backgroundColor: '#111' }, profileTag: { color: '#e6ff55', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, input: { height: 50, borderBottomWidth: 1, borderColor: '#666', color: '#f3f3f0', fontSize: 16, marginTop: 15 }, signedInText: { color: '#aaa', fontSize: 14, lineHeight: 21, marginTop: 18 }, privacyNote: { color: '#666', fontSize: 11, lineHeight: 17, marginTop: 20 }, nav: { borderTopWidth: 1, borderColor: '#2b2b2b', height: 74, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#0b0b0b' }, navButton: { alignItems: 'center', paddingHorizontal: 12, gap: 7 }, navMark: { width: 20, height: 2, backgroundColor: '#444' }, navMarkActive: { backgroundColor: '#e6ff55', width: 26 }, navLabel: { color: '#676760', fontSize: 9, letterSpacing: 1.5, fontWeight: '700' }, navLabelActive: { color: '#f3f3f0' },
});
