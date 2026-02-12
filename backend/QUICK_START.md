# User Management System - Quick Start Guide

## ✅ System Status: ACTIVE

The User Management system is now fully activated and ready to use!

---

## 🎯 What's Been Activated

### 1. Departments (4 Total)
- **Sales** - Lead & Deal management
- **Marketing** - Campaign & lead generation
- **Inventory** - Property listing & management
- **Accounts** - Payment & commission processing

### 2. System Roles (8 Total)

#### Sales Department
- **Sales Executive** - Entry-level sales (assigned data scope)
- **Sales Manager** - Team lead (team data scope)

#### Marketing Department
- **Marketing Executive** - Campaign execution (department data scope)
- **Marketing Manager** - Campaign strategy (department data scope)

#### Inventory Department
- **Inventory Executive** - Property listing (all data scope)
- **Inventory Manager** - Portfolio management (all data scope)

#### Accounts Department
- **Accounts Executive** - Payment processing (all data scope)
- **Accounts Manager** - Financial oversight (all data scope, full approvals)

### 3. Test User Created

**Login Credentials:**
- **Email**: test@bharatproperties.com
- **Password**: Test@123
- **Department**: Sales
- **Role**: Sales Executive
- **Data Scope**: Assigned (can only see own data)

---

## 🚀 How to Create New Users

### Option 1: Using the Seeder Script

Create a new user script in `backend/seeders/`:

```javascript
import createUser from './create-test-user.js';
// Modify the user details and run
node seeders/your-user-script.js
```

### Option 2: Using the API

**Endpoint**: `POST /api/users`

**Request Body**:
```json
{
  "fullName": "John Doe",
  "email": "john@bharatproperties.com",
  "mobile": "+91 9876543210",
  "username": "johndoe",
  "password": "SecurePass@123",
  "department": "sales",
  "role": "698dd4b9bd3d4e86dae27416",  // Role ID from database
  "dataScope": "assigned",
  "financialPermissions": {
    "canViewMargin": false,
    "canEditCommission": false
  }
}
```

**Password Requirements**:
- Minimum 8 characters
- Must contain: uppercase, lowercase, numbers, special characters
- Cannot reuse last 5 passwords
- Expires after 90 days

### Option 3: Using Frontend (Coming Soon)
The user creation UI will be available in Phase 3.

---

## 📋 Available API Endpoints

### User Management
- `GET /api/users` - List all users (with filters)
- `GET /api/users/:id` - Get user details
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user
- `POST /api/users/:id/deactivate` - Deactivate with data transfer
- `POST /api/users/:id/force-logout` - Force logout all sessions
- `GET /api/users/hierarchy` - Get org hierarchy
- `GET /api/users/:id/team` - Get team members
- `GET /api/users/:id/sessions` - Get active sessions
- `GET /api/users/:id/audit-trail` - Get audit log

### Role Management
- `GET /api/roles` - List all roles
- `GET /api/roles/:id` - Get role details
- `POST /api/roles` - Create custom role
- `PUT /api/roles/:id` - Update role
- `DELETE /api/roles/:id` - Delete role
- `GET /api/roles/templates` - Get role templates
- `POST /api/roles/clone` - Clone existing role
- `GET /api/roles/:id/users` - Get users with role

---

## 🔧 Getting Role IDs

To create users, you need the Role ID. Get it via:

**Method 1: API**
```bash
curl http://localhost:5000/api/roles?department=sales
```

**Method 2: MongoDB**
```javascript
db.roles.find({ name: "Sales Executive" })
```

**Method 3: From Seeder Output**
The role IDs are shown when you run the seeder.

---

## 🔐 Security Features Active

✅ **Password Policy**: 8+ chars, complexity requirements, 90-day expiry  
✅ **Account Lockout**: 5 failed attempts = 30-minute lockout  
✅ **Session Management**: Device tracking, force logout capability  
✅ **Permission Caching**: Redis-based caching for performance  
✅ **Audit Trail**: All user/role changes are logged  

---

## 📝 Next Steps

1. **Create Admin User**: Create a user with full permissions
2. **Set up Redis**: For production, configure Redis for caching
3. **Configure Environment**: Add Redis credentials to `.env`
4. **Test APIs**: Use Postman/Thunder Client to test endpoints
5. **Build Frontend**: Phase 3 - User Management UI

---

## 🆘 Troubleshooting

### "Role not found" error
Run the role seeder: `node seeders/roles.seeder.js`

### "Password policy violation"
Ensure password meets requirements (8+ chars, uppercase, lowercase, numbers, special chars)

### "User already exists"
Check if email is already in use: `GET /api/users?search=email@example.com`

### Redis connection errors
Redis is optional for development. For production, install and configure Redis.

---

## 📞 Support

For issues or questions, refer to:
- [`walkthrough.md`](file:///Users/bharatproperties/.gemini/antigravity/brain/ae5b3acb-0eff-4019-b010-6901aeedab71/walkthrough.md) - Complete implementation details
- [`user_management_analysis.md`](file:///Users/bharatproperties/.gemini/antigravity/brain/ae5b3acb-0eff-4019-b010-6901aeedab71/user_management_analysis.md) - System analysis and improvements
