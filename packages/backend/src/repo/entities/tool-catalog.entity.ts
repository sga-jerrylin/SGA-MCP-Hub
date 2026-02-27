import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('tool_catalog')
@Unique(['packageId', 'toolName'])
export class ToolCatalogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', name: 'package_id', length: 255 })
  packageId!: string;

  @Column({ type: 'varchar', name: 'package_name', length: 255 })
  packageName!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column('text', { array: true, nullable: true, default: () => "'{}'" })
  tags!: string[];

  @Column({ type: 'varchar', name: 'tool_name', length: 255 })
  toolName!: string;

  @Column({ type: 'varchar', name: 'full_name', length: 255, unique: true })
  fullName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'input_schema', type: 'jsonb', nullable: true })
  inputSchema!: Record<string, unknown> | null;

  @Column({ type: 'varchar', name: 'schema_version', length: 10, default: 'legacy' })
  schemaVersion!: string;

  @Column({ type: 'varchar', length: 20, default: 'manifest' })
  source!: string;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
