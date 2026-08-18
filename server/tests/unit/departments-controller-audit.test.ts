jest.mock('../../src/services/auditLogService', () => ({
  logAction: jest.fn(),
}));

const mockDepartmentsRepository = {
  findById: jest.fn(),
};

const mockDeactivateDepartmentExecute = jest.fn();

jest.mock('../../src/modules/departments/infrastructure/sequelize/SequelizeDepartmentsRepository', () => {
  return jest.fn().mockImplementation(() => mockDepartmentsRepository);
});

jest.mock('../../src/modules/departments/application/use-cases/ListDepartmentsUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/departments/application/use-cases/GetDepartmentByIdUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/departments/application/use-cases/CreateDepartmentUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/departments/application/use-cases/UpdateDepartmentUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/departments/application/use-cases/DeactivateDepartmentUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: mockDeactivateDepartmentExecute }));
});

import { logAction } from '../../src/services/auditLogService';
const departmentController = require('../../src/modules/departments/presentation/controllers/departmentController');

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('departmentController.remove com auditoria (CASE-014)', () => {
  beforeEach(() => {
    (logAction as jest.Mock).mockClear();
    mockDepartmentsRepository.findById.mockReset();
    mockDeactivateDepartmentExecute.mockReset();
  });

  it('audita a inativação de departamento com sigla e nome na descrição', async () => {
    const req: any = { params: { id: '4' } };
    const res = mockRes();
    const next = jest.fn();
    mockDepartmentsRepository.findById.mockResolvedValueOnce({
      id: 4,
      sigla: 'PRD',
      name: 'Produção',
      active: true,
    });
    mockDeactivateDepartmentExecute.mockResolvedValueOnce({ message: 'Departamento inativado com sucesso' });

    await departmentController.remove(req, res, next);

    expect(logAction).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        action: 'soft_delete',
        entityType: 'Department',
        entityId: 4,
        entityDescription: 'PRD — Produção',
        oldValues: { active: true },
        newValues: { active: false },
        description: 'Departamento Produção inativado',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
