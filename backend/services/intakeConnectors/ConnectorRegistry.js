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
            throw new Error("Connector must have a sourceType property");
        }
        this.connectors.set(connectorInstance.sourceType, connectorInstance);
    }

    getConnector(sourceType) {
        const connector = this.connectors.get(sourceType);
        if (!connector) {
            throw new Error(`No connector registered for source_type: ${sourceType}`);
        }
        return connector;
    }
}

export default new ConnectorRegistry();
