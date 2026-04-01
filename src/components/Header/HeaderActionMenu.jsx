
const HeaderActionMenu = ({ 
    onAddContact, 
    onAddCompany, 
    onAddLead, 
    onAddDeal, 
    onAddProject, 
    onAddInventory, 
    onAddActivity 
}) => {
    return (
        <div className="add-dropdown">
            <button className="add-btn" id="addBtn">
                <span>Add</span>
                <i className="fas fa-chevron-down" style={{ fontSize: '0.6rem' }}></i>
            </button>
            <div className="dropdown-menu">
                <a href="#" onClick={(e) => { e.preventDefault(); onAddContact(); }}><i className="fas fa-user-plus"></i> Add Contact</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onAddCompany(); }}><i className="fas fa-building"></i> Add Company</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onAddLead(); }}><i className="fas fa-filter"></i> Add Lead</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onAddDeal(); }}><i className="fas fa-handshake"></i> Add Deal</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onAddProject(); }}><i className="fas fa-building"></i> Add Project</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onAddInventory(); }}><i className="fas fa-boxes"></i> Add Inventory</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onAddActivity(); }}><i className="fas fa-tasks"></i> Add Activities</a>
            </div>
        </div>
    );
};

export default HeaderActionMenu;
