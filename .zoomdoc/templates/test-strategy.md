# Test strategy

## 1. Policy and test pyramid
- **Unit**: responsibilities, module boundaries, expected coverage
- **Integration**: cooperation between components, database and file I/O tests
- **E2E / scenario**: end-to-end acceptance scenarios

## 2. Discipline on mocks and external dependencies
- What is mocked (external APIs, timers, network and so on):
- What is tested close to the real thing (local database, file system and so on):

## 3. Test automation and CI rules
- What runs before commit or push (pre-commit):
- What runs before a pull request is merged (CI):
