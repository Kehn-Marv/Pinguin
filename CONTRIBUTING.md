# Contributing to Pinguin

Thank you for your interest in contributing to Pinguin! We welcome contributions from the community and are excited to see what you'll bring to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors. We expect:

- Respectful communication
- Constructive feedback
- Focus on the project's goals
- Welcoming attitude toward newcomers

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue on GitHub with:

1. **Clear Title**: Summarize the issue in one line
2. **Description**: Detailed explanation of the problem
3. **Steps to Reproduce**: Numbered list of steps
4. **Expected Behavior**: What should happen
5. **Actual Behavior**: What actually happens
6. **Environment**: OS, Arm device, app version
7. **Screenshots**: If applicable
8. **Logs**: Relevant error messages or logs

**Example**:
```
Title: Document upload fails for large PDFs on Windows on Arm

Description: When uploading PDFs larger than 50MB, the app crashes during processing.

Steps to Reproduce:
1. Launch Pinguin on Windows on Arm
2. Click "Upload Document"
3. Select a PDF file > 50MB
4. Click "Open"

Expected: Document processes successfully
Actual: App crashes with "Out of memory" error

Environment:
- OS: Windows 11 on Arm (build 22621)
- Device: Surface Pro X
- Pinguin version: 1.0.0
- RAM: 8GB

Logs: [attach log file]
```

### Suggesting Features

We love new ideas! To suggest a feature:

1. **Check Existing Issues**: Avoid duplicates
2. **Create an Issue**: Use "Feature Request" template
3. **Describe the Feature**: What it does and why it's useful
4. **Use Cases**: Real-world scenarios
5. **Mockups**: Visual designs if applicable
6. **Implementation Ideas**: Technical approach (optional)

### Submitting Pull Requests

#### Before You Start

1. **Check Issues**: Look for open issues or create one
2. **Discuss**: Comment on the issue to claim it
3. **Fork**: Fork the repository to your account
4. **Branch**: Create a feature branch from `main`

#### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Pinguin.git
cd Pinguin

# Add upstream remote
git remote add upstream https://github.com/Kehn-Marv/Pinguin.git

# Install dependencies
npm install
cd backend && pip install -r requirements.txt && cd ..

# Create feature branch
git checkout -b feature/your-feature-name
```

#### Making Changes

1. **Code Style**: Follow existing patterns
2. **TypeScript**: Use strict typing, avoid `any`
3. **Python**: Follow PEP 8 style guide
4. **Comments**: Explain complex logic
5. **Tests**: Add tests for new features (when applicable)
6. **Documentation**: Update docs if needed

#### Code Style Guidelines

**TypeScript/JavaScript**
```typescript
// Use descriptive names
const documentProcessor = new DocumentProcessor();

// Prefer const over let
const maxRetries = 3;

// Use async/await over promises
async function processDocument(path: string): Promise<Result> {
  const content = await extractText(path);
  return content;
}

// Type everything
interface DocumentMetadata {
  title: string;
  author?: string;
  pages: number;
}
```

**Python**
```python
# Follow PEP 8
def process_document(file_path: str, doc_id: str) -> IngestResult:
    """
    Process a document and ingest into vector store.
    
    Args:
        file_path: Path to document file
        doc_id: Unique document identifier
        
    Returns:
        IngestResult with status and chunk count
    """
    # Use type hints
    chunks: List[str] = chunk_text(content)
    return IngestResult(status="success", chunks=len(chunks))
```

#### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add support for EPUB documents
fix: Resolve memory leak in document processor
docs: Update installation instructions for Linux Arm64
refactor: Simplify embedding cache logic
test: Add unit tests for chunking algorithm
chore: Update dependencies to latest versions
```

Format: `type: description`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

#### Testing

```bash
# Run frontend tests
npm test

# Run backend tests
cd backend
pytest
cd ..

# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

#### Submitting

1. **Push**: Push your branch to your fork
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Pull Request**: Create a PR on GitHub
   - Use a clear title
   - Reference related issues
   - Describe your changes
   - Add screenshots if UI changes
   - Check all CI tests pass

3. **Review**: Respond to feedback
   - Be open to suggestions
   - Make requested changes
   - Push updates to the same branch

4. **Merge**: Once approved, we'll merge your PR

#### Pull Request Template

```markdown
## Description
Brief description of changes

## Related Issue
Fixes #123

## Changes Made
- Added feature X
- Fixed bug Y
- Updated documentation Z

## Testing
- [ ] Tested on Windows on Arm
- [ ] Tested on macOS (Apple Silicon)
- [ ] Tested on Linux Arm64
- [ ] Added unit tests
- [ ] Updated documentation

## Screenshots
[If applicable]

## Checklist
- [ ] Code follows project style
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## Development Guidelines

### Project Structure

```
Pinguin/
├── src/
│   ├── main/          # Electron main process
│   ├── renderer/      # React frontend
│   └── types/         # TypeScript types
├── backend/
│   ├── rag/           # RAG pipeline
│   ├── extractors/    # Document extractors
│   ├── models/        # Data models
│   └── utils/         # Utilities
├── docs/              # Documentation
├── public/            # Static assets
└── scripts/           # Build scripts
```

### Key Technologies

- **Frontend**: Electron, React, TypeScript, Material-UI
- **Backend**: Python, FastAPI, LangChain, ChromaDB
- **AI**: Ollama, Sentence Transformers
- **Build**: Webpack, Electron Forge

### Arm Optimization

When contributing, keep Arm optimization in mind:

- Use native Arm64 builds of dependencies
- Test on actual Arm hardware when possible
- Profile memory usage and performance
- Consider power efficiency
- Document Arm-specific considerations

### Documentation

Update documentation when:

- Adding new features
- Changing APIs
- Modifying build process
- Updating dependencies
- Fixing significant bugs

Documentation locations:
- `README.md`: Overview and quick start
- `docs/TECHNICAL.md`: Architecture details
- `docs/ARM_BUILD_GUIDE.md`: Build instructions
- `docs/API.md`: API reference
- Code comments: Complex logic

## Community

### Getting Help

- **GitHub Discussions**: Ask questions, share ideas
- **Issues**: Report bugs, request features
- **Email**: kehnmarv30@gmail.com for private inquiries

### Recognition

Contributors will be:
- Listed in release notes
- Credited in documentation
- Acknowledged in the community

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Don't hesitate to ask! We're here to help:

- Open a discussion on GitHub
- Comment on relevant issues
- Reach out via email

Thank you for contributing to Pinguin and helping make privacy-first AI accessible to students worldwide!
