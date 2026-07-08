const fs = require('fs');
const file = 'frontend/src/screens/chat/ChatRoomScreen.js';
let c = fs.readFileSync(file, 'utf8');

if (!c.includes('const [kbHeight, setKbHeight] = useState(0);')) {
  const stateInsert = `  const [kbHeight, setKbHeight] = useState(0);
  
  useEffect(() => {
    if (Platform.OS === 'android') {
      const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
      const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
      return () => { showSub.remove(); hideSub.remove(); };
    }
  }, []);
`;
  
  c = c.replace(/(export default function ChatRoomScreen.*?\n)/, `$1${stateInsert}`);
}

const targetKba = `<KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 90}
      >`;

const replaceKba = `<KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? kbHeight : 0 }}>`;

c = c.replace(targetKba, replaceKba);

// Since we added an opening <View>, we need to close it before </KeyboardAvoidingView>
// The target </KeyboardAvoidingView> is the one that wraps the main chat content.
// It's the LAST one in the file because the component ends soon after.

// Let's find the position of the last </KeyboardAvoidingView>
const lastIndex = c.lastIndexOf('</KeyboardAvoidingView>');
if (lastIndex !== -1 && c.includes('<View style={{ flex: 1, paddingBottom: Platform.OS === \'android\' ? kbHeight : 0 }}>')) {
  c = c.substring(0, lastIndex) + '        </View>\n      ' + c.substring(lastIndex);
}

fs.writeFileSync(file, c);
