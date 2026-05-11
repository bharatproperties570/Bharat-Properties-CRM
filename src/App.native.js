import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, Image } from 'react-native';

const App = () => {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <View style={styles.card}>
                <View style={styles.logoContainer}>
                    <Text style={styles.logoEmoji}>🏢</Text>
                </View>
                <Text style={styles.title}>Bharat Properties</Text>
                <Text style={styles.subtitle}>Native CRM Mobile Interface</Text>
                
                <View style={styles.statusBox}>
                    <View style={styles.statusIndicator} />
                    <Text style={styles.statusText}>Establishing Secure Connection...</Text>
                </View>

                <View style={styles.infoSection}>
                    <Text style={styles.infoTitle}>Optimization in Progress</Text>
                    <Text style={styles.infoDesc}>
                        We are currently synchronizing the unified enterprise engine with the native mobile environment.
                    </Text>
                </View>
            </View>
            
            <Text style={styles.footer}>© 2025 BHARAT PROPERTIES • ENTERPRISE v1.0</Text>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a', // Slate 900
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        width: '85%',
        backgroundColor: 'rgba(30, 41, 59, 0.7)', // Slate 800 with alpha
        borderRadius: 32,
        padding: 40,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 10,
    },
    logoContainer: {
        width: 80,
        height: 80,
        backgroundColor: '#3b82f6',
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: "#3b82f6",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
    },
    logoEmoji: {
        fontSize: 40,
    },
    title: {
        color: '#f8fafc',
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -1,
        marginBottom: 8,
    },
    subtitle: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 32,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    statusBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 100,
        marginBottom: 32,
    },
    statusIndicator: {
        width: 8,
        height: 8,
        backgroundColor: '#10b981', // Emerald 500
        borderRadius: 4,
        marginRight: 10,
    },
    statusText: {
        color: '#10b981',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    infoSection: {
        width: '100%',
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.1)',
    },
    infoTitle: {
        color: '#3b82f6',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 6,
    },
    infoDesc: {
        color: '#64748b',
        fontSize: 12,
        lineHeight: 18,
    },
    footer: {
        position: 'absolute',
        bottom: 40,
        color: '#475569',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
    }
});

export default App;
