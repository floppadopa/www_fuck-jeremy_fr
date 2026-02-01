# AI Agent Checklist - MANDATORY

This checklist MUST be followed for every code change. AI agents should verify each item before completing a task.

## 📋 Pre-Task Checklist

Before starting ANY task:

- [ ] Read `/conventions_rules.md` if not already familiar
- [ ] Understand the naming conventions (UpperCamelCase components, snake_case folders)
- [ ] Know that CSS must go in `_css/` subfolders
- [ ] Remember: NO index files allowed
- [ ] Remember: ALWAYS use `~/` imports, NEVER `@/`

## 🏗️ During Task Checklist

### When Creating Components:

- [ ] Component name is UpperCamelCase (e.g., `UserProfile.tsx`)
- [ ] Parent folder is snake_case (e.g., `user_settings/`)
- [ ] If CSS needed, create `_css/` subfolder
- [ ] CSS file matches component name exactly
- [ ] CSS imported with `import './_css/ComponentName.css';`
- [ ] Component uses `~/` for all imports from src/

### When Creating Folders:

- [ ] Folder name is snake_case (e.g., `billing_portal/`)
- [ ] NOT using kebab-case or PascalCase
- [ ] If for components with CSS, include `_css/` subfolder

### When Modifying Database:

- [ ] Modified `prisma/schema.prisma`
- [ ] Updated `prisma/schema.dbml` to match
- [ ] Added/updated table definitions in DBML
- [ ] Added/updated Ref relationships in DBML
- [ ] Synchronized all fields, types, defaults
- [ ] Both files will be committed together

### When Moving/Renaming Files:

- [ ] Searched entire codebase for old import paths
- [ ] Updated ALL import statements
- [ ] Moved CSS file if component has one
- [ ] Maintained `_css/` folder structure
- [ ] Verified no broken imports remain

## ✅ Post-Task Checklist

After completing ANY task, verify:

### Naming Verification:
- [ ] ALL components are UpperCamelCase
- [ ] ALL folders are snake_case
- [ ] NO files use kebab-case or mixed styles
- [ ] CSS files are in `_css/` subfolders

### Import Verification:
- [ ] ALL imports from src/ use `~/` path alias
- [ ] NO imports use `@/` path alias
- [ ] NO relative imports like `../../../`
- [ ] NO `index.ts` or `index.tsx` files exist
- [ ] NO barrel exports created

### Database Verification (if applicable):
- [ ] `schema.prisma` and `schema.dbml` are in sync
- [ ] Both files have matching table structures
- [ ] All relationships (Ref) are updated in DBML
- [ ] Migration command noted for user

### Code Quality:
- [ ] Code follows TypeScript best practices
- [ ] No linting errors introduced
- [ ] Types are properly defined
- [ ] No `any` types unless absolutely necessary

### Git Preparation:
- [ ] Changes are ready to commit
- [ ] Related files modified together (e.g., both schema files)
- [ ] No temporary/test files left behind

## 🚨 Red Flags - NEVER DO THESE

These actions are FORBIDDEN:

- ❌ Creating component with lowercase first letter
- ❌ Creating folder with PascalCase or kebab-case
- ❌ Placing CSS file next to component (must be in `_css/`)
- ❌ Using `@/` for imports
- ❌ Creating `index.ts` or `index.tsx` files
- ❌ Modifying `schema.prisma` without updating `schema.dbml`
- ❌ Using relative imports from src/ (`../../../`)
- ❌ Forgetting to update imports after moving files

## 💡 Quick Reference

| Task | Correct | Wrong |
|------|---------|-------|
| Component name | `UserProfile.tsx` | `userProfile.tsx`, `user-profile.tsx` |
| Folder name | `user_profile/` | `UserProfile/`, `user-profile/` |
| CSS location | `_css/UserProfile.css` | `UserProfile.css` |
| Import path | `~/components/Header` | `@/components/Header`, `../Header` |
| Index files | ❌ Never | `index.tsx` |

## 🔄 Self-Correction

If you realize you've made a mistake:

1. ✅ Acknowledge the error
2. ✅ Correct it immediately
3. ✅ Verify the correction follows conventions
4. ✅ Update all related files (imports, CSS, etc.)
5. ✅ Run through checklist again

## 📖 Full Documentation

For complete details, see:
- `/conventions_rules.md` - Full conventions documentation
- `.cursor/rules/rules.mdc` - Cursor-specific rules
- `prisma/SCHEMA_VISUALIZATION.md` - Database schema guide

---

**Remember**: Following these conventions is NOT optional. They ensure code consistency, maintainability, and team collaboration. Every violation makes the codebase harder to maintain.

