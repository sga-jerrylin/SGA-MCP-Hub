import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('hub_settings')
export class HubSettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column('text')
  value!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}