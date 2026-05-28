import ManualConnector from './ManualConnector.js';
import PdfConnector from './PdfConnector.js';
import PublicUrlConnector from './PublicUrlConnector.js';
import ZipConnector from './ZipConnector.js';
import GoogleIndexConnector from './GoogleIndexConnector.js';
import PropertyListingConnector from './PropertyListingConnector.js';

class ConnectorRegistry {
    constructor() {
        this.connectors = new Map();
        
        // Register default connectors
        this.register(ManualConnector);
        this.register(PdfConnector);
        this.register(PublicUrlConnector);
        this.register(ZipConnector);
        this.register(GoogleIndexConnector);
        this.register(PropertyListingConnector);
    }

    register(connectorInstance) {
        if (!connectorInstance.sourceType) {
            console.error("[ConnectorRegistry] Attempted to register connector without sourceType:", connectorInstance);
            throw new Error("Connector must have a sourceType property");
        }
        console.log(`[ConnectorRegistry] Registered connector for: ${connectorInstance.sourceType}`);
        this.connectors.set(connectorInstance.sourceType, connectorInstance);
    }

    getConnector(sourceType) {
        console.log(`[ConnectorRegistry] Fetching connector for: ${sourceType}`);
        let connector = this.connectors.get(sourceType);
        if (!connector) {
            console.warn(`[ConnectorRegistry] No connector found for ${sourceType}. Falling back to manual connector.`);
            connector = this.connectors.get('manual');
        }
        return connector;
    }
}

export default new ConnectorRegistry();
