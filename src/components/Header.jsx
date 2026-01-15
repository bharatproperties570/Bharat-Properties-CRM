import React from 'react';

function Header() {
    return (
        <header className="header">
            <div className="header-left">
                <div className="add-dropdown">
                    <button className="add-btn" id="addBtn">
                        <span>Add</span>
                        <i className="fas fa-chevron-down" style={{ fontSize: '0.6rem' }}></i>
                    </button>
                    <div className="dropdown-menu">
                        <a href="#"><i className="fas fa-user-plus"></i> Add Contact</a>
                        <a href="#"><i className="fas fa-filter"></i> Add Lead</a>
                        <a href="#"><i className="fas fa-handshake"></i> Add Deal</a>
                        <a href="#"><i className="fas fa-building"></i> Add Project</a>
                        <a href="#"><i className="fas fa-boxes"></i> Add Inventory</a>
                    </div>
                </div>
            </div>

            <div className="header-right">
                <div className="search-min">
                    <i className="fas fa-search" style={{ fontSize: '0.8rem', color: '#68737d', marginRight: '6px' }}></i>
                    <input type="text" placeholder="Search" />
                </div>
                <i className="fas fa-phone-alt header-icon"></i>
                <i className="fas fa-bell header-icon"></i>
                <i className="fas fa-th header-icon"></i>
                <div className="profile-circle">BP</div>
            </div>
        </header>
    );
}

export default Header;
