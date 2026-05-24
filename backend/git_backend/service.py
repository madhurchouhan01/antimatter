import git
from git import Repo, Actor, InvalidGitRepositoryError
from dataclasses import dataclass
from pathlib import Path

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
    def __init__(self, workspace_path: str):
        self.path = workspace_path
        try:
            self.repo = Repo(workspace_path)
            self.is_repo = True
        except InvalidGitRepositoryError:
            self.repo = None
            self.is_repo = False

    def init(self) -> None:
        """Initialize a new git repo in the workspace."""
        self.repo = Repo.init(self.path)
        self.is_repo = True

    def status(self) -> GitStatus:
        if not self.is_repo:
            return GitStatus(
                branch="", staged=[], unstaged=[],
                untracked=[], ahead=0, behind=0, is_repo=False
            )
        try:
            branch = self.repo.active_branch.name
        except TypeError:
            branch = "HEAD (detached)"

        staged   = [item.a_path for item in self.repo.index.diff("HEAD")] if self.repo.head.is_valid() else []
        unstaged = [item.a_path for item in self.repo.index.diff(None)]
        untracked = self.repo.untracked_files

        # Ahead/behind vs origin
        ahead = behind = 0
        try:
            origin = self.repo.remotes.origin
            origin.fetch()
            commits_ahead  = list(self.repo.iter_commits(f"origin/{branch}..{branch}"))
            commits_behind = list(self.repo.iter_commits(f"{branch}..origin/{branch}"))
            ahead  = len(commits_ahead)
            behind = len(commits_behind)
        except Exception:
            pass

        return GitStatus(
            branch=branch,
            staged=staged,
            unstaged=unstaged,
            untracked=untracked,
            ahead=ahead,
            behind=behind,
            is_repo=True
        )

    def diff(self, staged: bool = False, file_path: str | None = None) -> str:
        if not self.is_repo:
            return ""
        try:
            if staged:
                return self.repo.git.diff("--cached", file_path or "")
            return self.repo.git.diff(file_path or "")
        except Exception:
            return ""

    def stage(self, paths: list[str]) -> None:
        self.repo.index.add(paths)

    def unstage(self, paths: list[str]) -> None:
        self.repo.index.reset(paths=paths)

    def commit(self, message: str, author_name: str, author_email: str = "") -> str:
        author = Actor(author_name, author_email)
        commit = self.repo.index.commit(message, author=author, committer=author)
        return commit.hexsha

    def create_branch(self, name: str) -> None:
        self.repo.create_head(name).checkout()

    def checkout(self, branch: str) -> None:
        self.repo.git.checkout(branch)

    def branches(self) -> list[str]:
        return [b.name for b in self.repo.branches]

    def log(self, max_count: int = 20) -> list[dict]:
        if not self.is_repo or not self.repo.head.is_valid():
            return []
        commits = []
        for c in self.repo.iter_commits(max_count=max_count):
            commits.append({
                "sha":     c.hexsha[:8],
                "message": c.message.strip(),
                "author":  c.author.name,
                "date":    c.committed_datetime.isoformat(),
            })
        return commits
    