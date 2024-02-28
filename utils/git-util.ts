import { execSync } from 'child_process';

// branch_name || branch-name || branch.name => BranchName
const formatName = (name: string): string => {
  const words = name.split(/[_\-.]/);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
};

const getCurrentGitBranch = (): string => {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    return formatName(currentBranch);
  } catch (errr) {
    return 'Master';
  }
};

const isMasterBranch = (): boolean => getCurrentGitBranch().toLowerCase() === 'master';

export { getCurrentGitBranch, isMasterBranch };
