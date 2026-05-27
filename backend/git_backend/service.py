from dataclasses import dataclass

@dataclass
class GitStatus:
    branch: str
    staged: list[str]
    unstaged: list[str]
    untracked: list[str]
    ahead: int
    behind: int
    is_repo: bool

class GitService:
    def __init__(self, project_id: str, user_id: str):
        self.project_id = str(project_id)
        self.user_id = str(user_id)
        self.container = None
        self.is_repo = False

    async def initialize(self) -> None:
        from sandbox.manager import sandbox_manager
        sandbox = await sandbox_manager.get_or_create(self.project_id, self.user_id)
        self.container = sandbox.container
        
        # Check if it is a git repository
        res = self.container.exec_run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            workdir="/workspace"
        )
        self.is_repo = (res.exit_code == 0)

    async def init(self) -> None:
        """Initialize a new git repo in the workspace."""
        if not self.container:
            await self.initialize()
        self.container.exec_run(["git", "init"], workdir="/workspace")
        self.is_repo = True

    async def status(self) -> GitStatus:
        if not self.is_repo:
            return GitStatus(
                branch="", staged=[], unstaged=[],
                untracked=[], ahead=0, behind=0, is_repo=False
            )
        
        # Try fetching in the background to get updated ahead/behind vs origin
        self.container.exec_run(["git", "fetch"], workdir="/workspace")
        
        # Run porcelain status with branch info
        res = self.container.exec_run(["git", "status", "--porcelain", "-b"], workdir="/workspace")
        output = res.output.decode("utf-8")
        
        lines = output.strip().splitlines() if output.strip() else []
        branch = ""
        ahead = 0
        behind = 0
        staged = []
        unstaged = []
        untracked = []
        
        for line in lines:
            if line.startswith("## "):
                # Parse branch and ahead/behind info
                branch_info = line[3:]
                if "..." in branch_info:
                    parts = branch_info.split("...")
                    branch = parts[0]
                    rest = parts[1]
                    if "[" in rest and "]" in rest:
                        stats = rest[rest.index("[")+1 : rest.index("]")]
                        for stat in stats.split(","):
                            stat = stat.strip()
                            if stat.startswith("ahead "):
                                ahead = int(stat.split(" ")[1])
                            elif stat.startswith("behind "):
                                behind = int(stat.split(" ")[1])
                else:
                    branch = branch_info
            else:
                if len(line) < 4:
                     continue
                code = line[:2]
                path = line[3:]
                if path.startswith('"') and path.endswith('"'):
                    path = path[1:-1]
                if " -> " in path:
                    path = path.split(" -> ")[-1]
                    
                x, y = code[0], code[1]
                if x in ('M', 'A', 'D', 'R', 'C'):
                    staged.append(path)
                if y in ('M', 'D'):
                    unstaged.append(path)
                if code == '??':
                    untracked.append(path)
                    
        return GitStatus(
            branch=branch,
            staged=staged,
            unstaged=unstaged,
            untracked=untracked,
            ahead=ahead,
            behind=behind,
            is_repo=True
        )

    async def diff(self, staged: bool = False, file_path: str | None = None) -> str:
        if not self.is_repo:
            return ""
        cmd = ["git", "diff"]
        if staged:
            cmd.append("--cached")
        if file_path:
            cmd.extend(["--", file_path])
        res = self.container.exec_run(cmd, workdir="/workspace")
        return res.output.decode("utf-8")

    async def stage(self, paths: list[str]) -> None:
        if not self.is_repo:
            return
        cmd = ["git", "add"] + paths
        self.container.exec_run(cmd, workdir="/workspace")

    async def unstage(self, paths: list[str]) -> None:
        if not self.is_repo:
            return
        cmd = ["git", "reset", "HEAD", "--"] + paths
        self.container.exec_run(cmd, workdir="/workspace")

    async def commit(self, message: str, author_name: str, author_email: str = "") -> str:
        if not self.is_repo:
            return ""
        self.container.exec_run(["git", "config", "local", "user.name", author_name], workdir="/workspace")
        self.container.exec_run(["git", "config", "local", "user.email", author_email or "author@antimatter.dev"], workdir="/workspace")
        
        cmd = ["git", "commit", "-m", message]
        self.container.exec_run(cmd, workdir="/workspace")
        
        res = self.container.exec_run(["git", "rev-parse", "HEAD"], workdir="/workspace")
        return res.output.decode("utf-8").strip()

    async def create_branch(self, name: str) -> None:
        if not self.is_repo:
            return
        self.container.exec_run(["git", "checkout", "-b", name], workdir="/workspace")

    async def checkout(self, branch: str) -> None:
        if not self.is_repo:
            return
        self.container.exec_run(["git", "checkout", branch], workdir="/workspace")

    async def branches(self) -> list[str]:
        if not self.is_repo:
            return []
        res = self.container.exec_run(["git", "branch"], workdir="/workspace")
        lines = res.output.decode("utf-8").splitlines()
        branches_list = []
        for line in lines:
            branch_name = line.replace("*", "").strip()
            if branch_name:
                branches_list.append(branch_name)
        return branches_list

    async def log(self, max_count: int = 20) -> list[dict]:
        if not self.is_repo:
            return []
        cmd = ["git", "log", f"-n{max_count}", "--pretty=format:%H|%s|%an|%cI"]
        res = self.container.exec_run(cmd, workdir="/workspace")
        if res.exit_code != 0:
            return []
        commits = []
        lines = res.output.decode("utf-8").splitlines()
        for line in lines:
            parts = line.split("|")
            if len(parts) >= 4:
                commits.append({
                    "sha":     parts[0][:8],
                    "message": parts[1],
                    "author":  parts[2],
                    "date":    parts[3],
                })
        return commits

    