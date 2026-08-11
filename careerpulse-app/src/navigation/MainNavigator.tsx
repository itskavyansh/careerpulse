import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CompanyListScreen } from '../screens/CompanyListScreen';
import { CompanyDetailScreen } from '../screens/CompanyDetailScreen';
import { MyJobsScreen } from '../screens/MyJobsScreen';
import { CompanyJobsScreen } from '../screens/CompanyJobsScreen';
import { TrackerScreen } from '../screens/TrackerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { supabase } from '../lib/supabase';
import { useTheme, FontSize } from '../context/ThemeContext';

export type MainTabParamList = {
  Discover: undefined;
  MyJobsStack: undefined;
  Tracker: undefined;
  Settings: undefined;
};

export type MyJobsStackParamList = {
  MyJobsList: undefined;
  CompanyJobs: { companyId: string; companyName: string };
};

export type DiscoverStackParamList = {
  DiscoverList: undefined;
  CompanyDetail: { companyId: string; companyName: string };
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MyJobsStackParamList>();
const DiscoverStack = createNativeStackNavigator<DiscoverStackParamList>();

interface Props {
  userId: string;
}

export function MainNavigator({ userId }: Props) {
  const { colors, isDark } = useTheme();

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const LogoutButton = () => (
    <Pressable
      onPress={handleLogout}
      style={({ pressed }) => [
        { marginRight: 16, padding: 4 },
        pressed && { opacity: 0.6 }
      ]}
      accessibilityRole="button"
      accessibilityLabel="Log out"
    >
      <Feather name="log-out" size={20} color={colors.textSecondary} />
    </Pressable>
  );

  function MyJobsStackScreen() {
    return (
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: FontSize.lg,
            color: colors.text,
          },
          headerTintColor: colors.primary,
        }}
      >
        <Stack.Screen
          name="MyJobsList"
          options={{
            title: 'My Jobs',
            headerRight: LogoutButton,
          }}
        >
          {(props: any) => (
            <MyJobsScreen
              userId={userId}
              onBrowseCompanies={() => props.navigation.navigate('Discover')}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="CompanyJobs"
          options={{
            title: 'Company Jobs',
          }}
        >
          {(props: any) => <CompanyJobsScreen userId={userId} />}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  function DiscoverStackScreen() {
    return (
      <DiscoverStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: FontSize.lg,
            color: colors.text,
          },
          headerTintColor: colors.primary,
        }}
      >
        <DiscoverStack.Screen
          name="DiscoverList"
          options={{
            title: 'Discover',
            headerRight: LogoutButton,
          }}
        >
          {() => <CompanyListScreen userId={userId} />}
        </DiscoverStack.Screen>

        <DiscoverStack.Screen
          name="CompanyDetail"
          options={{ title: 'Company Details' }}
        >
          {() => <CompanyDetailScreen userId={userId} />}
        </DiscoverStack.Screen>
      </DiscoverStack.Navigator>
    );
  }

  return (
    <NavigationContainer theme={{
      ...DefaultTheme,
      dark: isDark,
      colors: {
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      }
    }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: FontSize.lg,
            color: colors.text,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.1,
          },
        })}
      >
        <Tab.Screen
          name="Discover"
          options={{
            title: 'Discover',
            tabBarLabel: 'Discover',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Feather name="layers" size={20} color={color} />
            ),
          }}
          component={DiscoverStackScreen}
        />

        <Tab.Screen
          name="MyJobsStack"
          options={{
            title: 'My Jobs',
            tabBarLabel: 'My Jobs',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Feather name="briefcase" size={20} color={color} />
            ),
          }}
          component={MyJobsStackScreen}
        />

        <Tab.Screen
          name="Tracker"
          options={{
            title: 'Tracker',
            tabBarLabel: 'Tracker',
            headerRight: LogoutButton,
            tabBarIcon: ({ color }) => (
              <Feather name="activity" size={20} color={color} />
            ),
          }}
        >
          {() => <TrackerScreen userId={userId} />}
        </Tab.Screen>

        <Tab.Screen
          name="Settings"
          options={{
            title: 'Settings',
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color }) => (
              <Feather name="settings" size={20} color={color} />
            ),
          }}
        >
          {() => <SettingsScreen userId={userId} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}


