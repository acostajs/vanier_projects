import { Employee } from '../models'; 
import { IEmployee } from '../models/Employee'; 

export const getAllEmployees = async () => {
  try {
    // Find all employees, sort by name
    const employees = await Employee.find().sort({ name: 1 }).exec();
    return employees;
  } catch (error: any) {
    console.error('Error fetching employees:', error.message);
    throw new Error('Error fetching employees'); 
  }
};

export const getEmployeeById = async (id: string) => {
  try {
    const employee = await Employee.findById(id).exec();
    return employee; 
  } catch (error: any) {
    console.error(`Error fetching employee by id ${id}:`, error.message);
    throw new Error('Error fetching employee');
  }
};

export const createEmployee = async (employeeData: Partial<IEmployee>) => {
  try {
    const existing = await Employee.findOne({
      $or: [{ email: employeeData.email }, { name: employeeData.name }],
    }).exec();
    if (existing) {
      const field = existing.email === employeeData.email ? 'Email' : 'Name';
      throw new Error(`<span class="math-inline">\{field\} "</span>{existing[field.toLowerCase() as keyof IEmployee]}" already exists.`);
    }

    const newEmployee = new Employee(employeeData);
    await newEmployee.save();
    return newEmployee;
  } catch (error: any) {
    console.error('Error creating employee:', error.message);
    throw new Error(error.message || 'Error creating employee');
  }
};

export const updateEmployee = async (id: string, employeeData: Partial<IEmployee>) => {
  try {
     const existing = await Employee.findOne({
        $or: [{ email: employeeData.email }, { name: employeeData.name }],
        _id: { $ne: id } 
     }).exec();
     if (existing) {
        const field = existing.email === employeeData.email ? 'Email' : 'Name';
        throw new Error(`<span class="math-inline">\{field\} "</span>{existing[field.toLowerCase() as keyof IEmployee]}" already exists for another employee.`);
     }

    const updatedEmployee = await Employee.findByIdAndUpdate(id, employeeData, {
      new: true, 
      runValidators: true, 
    }).exec();
    return updatedEmployee;
  } catch (error: any) {
    console.error(`Error updating employee ${id}:`, error.message);
    throw new Error(error.message || 'Error updating employee');
  }
};

export const deleteEmployee = async (id: string): Promise<boolean> => {
  try {
    const result = await Employee.findByIdAndDelete(id).exec();
    return result !== null; 
  } catch (error: any) {
    console.error(`Error deleting employee ${id}:`, error.message);
    throw new Error('Error deleting employee');
  }
};