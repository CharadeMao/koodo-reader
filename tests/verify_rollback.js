/**
 * Rollback Verification Test
 * 驗證專案當前 Git 狀態與 hardcoded pro/authorization 邏輯
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runVerification() {
  console.log('=== Running Rollback Verification Test ===');

  // 1. Verify Git HEAD Commit ID
  const currentCommit = execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..') })
    .toString()
    .trim();
  
  console.log(`Current Git Commit ID: ${currentCommit}`);

  if (!currentCommit.startsWith('54bdb78f')) {
    console.error(`FAIL: Expected Commit 54bdb78f..., but got ${currentCommit}`);
    process.exit(1);
  }
  console.log('PASS: Git HEAD is set to commit 54bdb78f.');

  // 2. Verify files modified in 54bdb78f contain expected hardcoded values
  const managerFilePath = path.join(__dirname, '../src/store/actions/manager.tsx');
  const managerContent = fs.readFileSync(managerFilePath, 'utf8');

  if (managerContent.includes('dispatch(handleAuthed(true))') && managerContent.includes('TokenService.setToken("is_authed", "yes")')) {
    console.log('PASS: manager.tsx contains hardcoded authorization settings.');
  } else {
    console.error('FAIL: manager.tsx does not contain expected hardcoded authorization settings.');
    process.exit(1);
  }

  // 3. Check backup branch exists
  const branches = execSync('git branch', { cwd: path.join(__dirname, '..') }).toString();
  if (branches.includes('backup/dev-before-rollback')) {
    console.log('PASS: Backup branch backup/dev-before-rollback exists.');
  } else {
    console.error('FAIL: Backup branch backup/dev-before-rollback missing.');
    process.exit(1);
  }

  console.log('=== Rollback Verification Successful! ===');
}

runVerification();
