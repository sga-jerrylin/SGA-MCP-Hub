import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('tool_catalog')
@Unique(['packageId', 'toolName'])
export class ToolCatalogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'package_id', length: 255 })
  packageId!: string;

  @Column({ name: 'package_name', length: 255 })
  packageName!: string;

  @Column({ length: 100, nullable: true })
  category!: string | null;

  @Column('text', { array: true, nullable: true, default: () => "'{}'" })
  tags!: string[];

  @Column({ name: 'tool_name', length: 255 })
  toolName!: string;

  @Column({ name: 'full_name', length: 255, unique: true })
  fullName!: string;

  @Column('text', { nullable: true })
  description!: string | null;

  @Column({ name: 'input_schema', type: 'jsonb', nullable: true })
  inputSchema!: Record<string, unknown> | null;

  @Column({ name: 'schema_version', length: 10, default: 'legacy' })
  schemaVersion!: string;

  @Column({ length: 20, default: 'manifest' })
  source!: string;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
